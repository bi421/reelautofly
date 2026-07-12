import { TokenInputSchema, TokenOutputSchema } from '@reelautofly/shared'
import type { TokenInput, TokenOutput } from '@reelautofly/shared'

export const TokenGuard = {
  name: 'TokenGuard',
  async run(input: TokenInput): Promise<TokenOutput> {
    const parsed = TokenInputSchema.parse(input)

    if (parsed.status === 'REVOKED') {
      return TokenOutputSchema.parse({ valid: false, action: 'REAUTH_REQUIRED', reason: 'Token revoked' })
    }

    if (parsed.status === 'EXPIRED') {
      return TokenOutputSchema.parse({ valid: false, action: 'REFRESH_REQUIRED', reason: 'Token expired' })
    }

    if (parsed.tokenExpiresAt) {
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      if (parsed.tokenExpiresAt < sevenDaysFromNow) {
        return TokenOutputSchema.parse({ valid: false, action: 'REFRESH_REQUIRED', reason: 'Token expiring within 7 days' })
      }
    }

    try {
      // Placeholder for lightweight Graph API validation
      // In production: fetch(`https://graph.facebook.com/me?access_token=${decryptedToken}`)
      return TokenOutputSchema.parse({ valid: true })
    } catch {
      return TokenOutputSchema.parse({ valid: false, action: 'REAUTH_REQUIRED', reason: 'Graph API validation failed' })
    }
  },
}
