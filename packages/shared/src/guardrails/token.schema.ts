import { z } from 'zod'

export const TokenInputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['INSTAGRAM', 'FACEBOOK']),
  providerUserId: z.string(),
  pageId: z.string().optional(),
  encryptedAccessToken: z.string(),
  tokenExpiresAt: z.coerce.date().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
  lastRefreshedAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
})

export const TokenOutputSchema = z.object({
  valid: z.boolean(),
  action: z.enum(['REFRESH_REQUIRED', 'REAUTH_REQUIRED']).optional(),
  reason: z.string().optional(),
})

export type TokenInput = z.infer<typeof TokenInputSchema>
export type TokenOutput = z.infer<typeof TokenOutputSchema>
