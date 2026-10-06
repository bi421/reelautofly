import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { db } from '@reelautofly/db'
import { encrypt, decrypt, maskToken } from '@reelautofly/shared'
import type { ConnectAccountDto } from './dto'
import type { AccountResponse, ValidateTokenResponse } from './types'

@Injectable()
export class ConnectedAccountsService {
  private requireOAuthConfig() {
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    const redirectUri = process.env.META_OAUTH_REDIRECT_URI
    const version = process.env.META_GRAPH_API_VERSION
    if (!appId || !appSecret || !redirectUri || !version) {
      throw new BadRequestException('Meta OAuth is not configured')
    }
    return { appId, appSecret, redirectUri, version }
  }

  async createMetaOAuthUrl(userId: string, provider: 'INSTAGRAM' | 'FACEBOOK'): Promise<{ url: string }> {
    const { appId, redirectUri, version } = this.requireOAuthConfig()
    const state = randomBytes(32).toString('base64url')
    await db.metaOAuthState.create({
      data: {
        userId,
        provider,
        stateHash: createHash('sha256').update(state).digest('hex'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    })

    const scope = provider === 'INSTAGRAM'
      ? ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish']
      : ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata']
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`)
    url.searchParams.set('client_id', appId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', scope.join(','))
    return { url: url.toString() }
  }

  async handleMetaOAuthCallback(userId: string, code: string, state: string): Promise<{ provider: string; accountId: string }> {
    const { appId, appSecret, redirectUri, version } = this.requireOAuthConfig()
    const stateHash = createHash('sha256').update(state).digest('hex')
    const stateRow = await db.metaOAuthState.findUnique({ where: { stateHash } })
    if (!stateRow || stateRow.userId !== userId || stateRow.expiresAt <= new Date() || stateRow.usedAt) {
      throw new BadRequestException('Invalid or expired Meta OAuth state')
    }
    const claimed = await db.metaOAuthState.updateMany({
      where: { stateHash, userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })
    if (claimed.count !== 1) throw new BadRequestException('Meta OAuth state was already used')

    const tokenResponse = await fetch(`https://graph.facebook.com/${version}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }),
    })
    const tokenData = await tokenResponse.json() as { access_token?: string; expires_in?: number; error?: { message?: string } }
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new BadRequestException(tokenData.error?.message || 'Meta OAuth token exchange failed')
    }

    const longLivedResponse = await fetch(`https://graph.facebook.com/${version}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: tokenData.access_token,
      }),
    })
    const longLived = await longLivedResponse.json() as { access_token?: string; error?: { message?: string } }
    if (!longLivedResponse.ok || !longLived.access_token) {
      throw new BadRequestException(longLived.error?.message || 'Meta long-lived token exchange failed')
    }

    const pagesResponse = await fetch(
      (() => {
        const url = new URL(`https://graph.facebook.com/${version}/me/accounts`)
        url.searchParams.set('fields', 'id,name,access_token,tasks,instagram_business_account')
        url.searchParams.set('access_token', longLived.access_token!)
        if (appSecret) url.searchParams.set('appsecret_proof', createHmac('sha256', appSecret).update(longLived.access_token!).digest('hex'))
        return url.toString()
      })(),
    )
    const pagesData = await pagesResponse.json() as {
      data?: Array<{ id: string; name?: string; access_token?: string; instagram_business_account?: { id: string } }>
      error?: { message?: string }
    }
    if (!pagesResponse.ok || pagesData.error) {
      throw new BadRequestException(pagesData.error?.message || 'Unable to read Meta Pages')
    }

    const page = (pagesData.data || []).find((item) =>
      item.access_token && (stateRow.provider === 'FACEBOOK' || item.instagram_business_account?.id),
    )
    if (!page?.access_token) {
      throw new BadRequestException(
        stateRow.provider === 'INSTAGRAM'
          ? 'No Facebook Page linked to an Instagram Professional account was available'
          : 'No Facebook Page available for this account',
      )
    }

    const providerUserId = stateRow.provider === 'INSTAGRAM'
      ? page.instagram_business_account?.id
      : page.id
    if (!providerUserId) throw new BadRequestException('Meta account identity is missing')

    const key = process.env.ENCRYPTION_KEY_32_BYTES
    if (!key) throw new BadRequestException('Encryption key is not configured')
    const { iv, authTag, encryptedData } = encrypt(page.access_token, key)
    const account = await db.account.upsert({
      where: { userId_provider_providerUserId: { userId, provider: stateRow.provider, providerUserId } },
      create: {
        userId,
        provider: stateRow.provider,
        providerUserId,
        pageId: page.id,
        encryptedAccessToken: iv + ':' + authTag + ':' + encryptedData,
        tokenExpiresAt: null,
        status: 'ACTIVE',
      },
      update: {
        pageId: page.id,
        encryptedAccessToken: iv + ':' + authTag + ':' + encryptedData,
        tokenExpiresAt: null,
        status: 'ACTIVE',
        lastRefreshedAt: new Date(),
      },
    })
    return { provider: stateRow.provider, accountId: account.id }
  }

  async connectAccount(userId: string, dto: ConnectAccountDto): Promise<AccountResponse> {
    const key = process.env.ENCRYPTION_KEY_32_BYTES
    if (!key) throw new Error('Encryption key is not configured')
    const { iv, authTag, encryptedData } = encrypt(dto.accessToken, key)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 60)
    const account = await db.account.create({
      data: { userId, provider: dto.provider, providerUserId: dto.providerUserId, pageId: dto.pageId,
        encryptedAccessToken: iv + ':' + authTag + ':' + encryptedData, tokenExpiresAt: expiresAt, status: 'ACTIVE' },
    })
    return { id: account.id, provider: account.provider, providerUserId: account.providerUserId, pageId: account.pageId,
      maskedToken: maskToken(dto.accessToken), tokenExpiresAt: account.tokenExpiresAt, status: account.status,
      lastRefreshedAt: account.lastRefreshedAt, createdAt: account.createdAt }
  }

  async getAccounts(userId: string): Promise<AccountResponse[]> {
    const accounts = await db.account.findMany({ where: { userId }, select: {
      id: true, provider: true, providerUserId: true, pageId: true, encryptedAccessToken: true,
      tokenExpiresAt: true, status: true, lastRefreshedAt: true, createdAt: true,
    }})
    const key = process.env.ENCRYPTION_KEY_32_BYTES
    if (!key) throw new Error('Encryption key is not configured')
    return accounts.map((account): AccountResponse => {
      let maskedToken = '********'
      try {
        const parts = account.encryptedAccessToken.split(':')
        if (parts.length === 3) maskedToken = maskToken(decrypt(parts[0], parts[1], parts[2], key))
      } catch { maskedToken = '********' }
      return { id: account.id, provider: account.provider, providerUserId: account.providerUserId, pageId: account.pageId,
        maskedToken, tokenExpiresAt: account.tokenExpiresAt, status: account.status,
        lastRefreshedAt: account.lastRefreshedAt, createdAt: account.createdAt }
    })
  }

  async disconnectAccount(userId: string, accountId: string): Promise<{ success: boolean }> {
    const account = await db.account.findFirst({ where: { id: accountId, userId } })
    if (!account) throw new NotFoundException('Account not found')
    await db.account.update({ where: { id: accountId }, data: { status: 'REVOKED' } })
    return { success: true }
  }

  async validateToken(userId: string, accountId: string): Promise<ValidateTokenResponse> {
    const account = await db.account.findFirst({ where: { id: accountId, userId } })
    if (!account) throw new NotFoundException('Account not found')
    const key = process.env.ENCRYPTION_KEY_32_BYTES
    if (!key) return { valid: false, reason: 'Encryption key is not configured' }
    try {
      const parts = account.encryptedAccessToken.split(':')
      if (parts.length !== 3) return { valid: false, reason: 'Invalid token format' }
      const plainToken = decrypt(parts[0], parts[1], parts[2], key)
      const version = process.env.META_GRAPH_API_VERSION
      if (!version) return { valid: false, reason: 'Meta Graph API version is not configured' }
      const appSecret = process.env.META_APP_SECRET
      const proof = appSecret ? createHmac('sha256', appSecret).update(plainToken).digest('hex') : undefined
      const url = new URL('https://graph.facebook.com/' + version + '/me')
      url.searchParams.set('fields', 'id,name')
      url.searchParams.set('access_token', plainToken)
      if (proof) url.searchParams.set('appsecret_proof', proof)
      const response = await fetch(url)
      const data = await response.json() as { id?: string; name?: string; error?: { message?: string } }
      if (!response.ok || data.error) {
        await db.account.update({ where: { id: account.id }, data: { status: 'EXPIRED' } })
        return { valid: false, reason: data.error?.message || 'Meta token validation failed' }
      }
      if (data.id && data.id !== account.providerUserId && account.provider === 'FACEBOOK') {
        return { valid: false, reason: 'Token identity does not match connected Facebook account' }
      }
      await db.account.update({ where: { id: account.id }, data: { status: 'ACTIVE' } })
      return { valid: true }
    } catch { return { valid: false, reason: 'Meta token validation failed' } }
  }
}
