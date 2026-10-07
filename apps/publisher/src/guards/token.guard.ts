import { decrypt } from '@reelautofly/shared'
import { TokenInputSchema, TokenOutputSchema } from '@reelautofly/shared'
import type { TokenInput, TokenOutput } from '@reelautofly/shared'
import { MetaGraphClient, MetaGraphError } from '../meta-graph.client'

function failure(
  action: 'REFRESH_REQUIRED' | 'REAUTH_REQUIRED',
  reason: string,
): TokenOutput {
  return TokenOutputSchema.parse({
    valid: false,
    action,
    reason,
  })
}

function decryptAccessToken(encryptedAccessToken: string): string {
  const parts = encryptedAccessToken.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted access token format')
  }

  const encryptionKey = process.env.ENCRYPTION_KEY_32_BYTES

  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY_32_BYTES is not configured')
  }

  return decrypt(
    parts[0],
    parts[1],
    parts[2],
    encryptionKey,
  )
}

export const TokenGuard = {
  name: 'TokenGuard',

  async run(input: TokenInput): Promise<TokenOutput> {
    const parsed = TokenInputSchema.parse(input)

    if (parsed.status === 'REVOKED') {
      return failure('REAUTH_REQUIRED', 'Token is revoked')
    }

    if (parsed.status === 'EXPIRED') {
      return failure('REFRESH_REQUIRED', 'Token is expired')
    }

    if (parsed.tokenExpiresAt) {
      const refreshThreshold = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      )

      if (parsed.tokenExpiresAt < refreshThreshold) {
        return failure('REFRESH_REQUIRED', 'Token expiring within 7 days')
      }
    }

    let accessToken: string

    try {
      accessToken = decryptAccessToken(parsed.encryptedAccessToken)
    } catch {
      return failure('REAUTH_REQUIRED', 'Unable to decrypt access token')
    }

    try {
      const client = new MetaGraphClient()
      const identity = await client.validateAccessToken(accessToken)

      if (
        parsed.providerUserId &&
        identity.id !== parsed.providerUserId
      ) {
        return failure(
          'REAUTH_REQUIRED',
          'Meta token identity does not match connected account',
        )
      }

      return TokenOutputSchema.parse({ valid: true })
    } catch (error) {
      if (
        error instanceof MetaGraphError &&
        error.categorize() === 'TOKEN_INVALID'
      ) {
        return failure('REAUTH_REQUIRED', 'Meta rejected the access token')
      }

      return failure('REAUTH_REQUIRED', 'Meta token validation failed')
    }
  },
}
