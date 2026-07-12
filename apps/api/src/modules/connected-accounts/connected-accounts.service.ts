import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { db } from '@reelautofly/db'
import { encrypt, decrypt, maskToken } from '@reelautofly/shared'
import type { ConnectAccountDto } from './dto'
import type { AccountResponse, ValidateTokenResponse } from './types'

@Injectable()
export class ConnectedAccountsService {
  async connectAccount(userId: string, dto: ConnectAccountDto): Promise<AccountResponse> {
    const { iv, authTag, encryptedData } = encrypt(dto.accessToken, process.env.ENCRYPTION_KEY_32_BYTES!)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 60)

    const account = await db.account.create({
      data: {
        userId,
        provider: dto.provider,
        providerUserId: dto.providerUserId,
        pageId: dto.pageId,
        encryptedAccessToken: `${iv}:${authTag}:${encryptedData}`,
        tokenExpiresAt: expiresAt,
        status: 'ACTIVE',
      },
    })

    return {
      id: account.id,
      provider: account.provider,
      providerUserId: account.providerUserId,
      pageId: account.pageId,
      maskedToken: maskToken(dto.accessToken),
      tokenExpiresAt: account.tokenExpiresAt,
      status: account.status,
      lastRefreshedAt: account.lastRefreshedAt,
      createdAt: account.createdAt,
    }
  }

  async getAccounts(userId: string): Promise<AccountResponse[]> {
    const accounts = await db.account.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        providerUserId: true,
        pageId: true,
        encryptedAccessToken: true,
        tokenExpiresAt: true,
        status: true,
        lastRefreshedAt: true,
        createdAt: true,
      },
    })

    return accounts.map((account): AccountResponse => {
      const parts = account.encryptedAccessToken.split(':')
      const encryptedPayload = parts.length === 3 ? parts[2] : ''
      return {
        id: account.id,
        provider: account.provider,
        providerUserId: account.providerUserId,
        pageId: account.pageId,
        maskedToken: maskToken(encryptedPayload),
        tokenExpiresAt: account.tokenExpiresAt,
        status: account.status,
        lastRefreshedAt: account.lastRefreshedAt,
        createdAt: account.createdAt,
      }
    })
  }

  async disconnectAccount(userId: string, accountId: string): Promise<{ success: boolean }> {
    const account = await db.account.findFirst({
      where: { id: accountId, userId },
    })

    if (!account) {
      throw new NotFoundException('Account not found')
    }

    await db.account.update({
      where: { id: accountId },
      data: { status: 'REVOKED' },
    })

    return { success: true }
  }

  async validateToken(accountId: string): Promise<ValidateTokenResponse> {
    const account = await db.account.findUnique({
      where: { id: accountId },
    })

    if (!account) {
      throw new NotFoundException('Account not found')
    }

    try {
      const parts = account.encryptedAccessToken.split(':')
      if (parts.length !== 3) {
        return { valid: false, reason: 'Invalid token format' }
      }

      const [, , encryptedData] = parts
      const plainToken = decrypt(parts[0], parts[1], encryptedData, process.env.ENCRYPTION_KEY_32_BYTES!)

      // Placeholder for Graph API validation
      // const response = await fetch(`https://graph.facebook.com/me?access_token=${plainToken}`)
      // const data = await response.json()
      // if (data.error) throw new Error(data.error.message)

      return { valid: true }
    } catch (err) {
      return { valid: false, reason: 'Token validation failed' }
    }
  }
}
