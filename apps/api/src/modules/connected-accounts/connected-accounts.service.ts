import { Injectable, NotFoundException } from '@nestjs/common'
import { db } from '@reelautofly/db'
import { encrypt, decrypt, maskToken } from '@reelautofly/shared'
import type { ConnectAccountDto } from './dto'
import type { AccountResponse, ValidateTokenResponse } from './types'

@Injectable()
export class ConnectedAccountsService {
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
      const version = process.env.META_GRAPH_API_VERSION || 'v20.0'
      const response = await fetch('https://graph.facebook.com/' + version + '/me?fields=id,name&access_token=' + encodeURIComponent(plainToken))
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
