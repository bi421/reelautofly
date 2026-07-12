import { z } from 'zod'

export const ConnectAccountSchema = z.object({
  provider: z.enum(['INSTAGRAM', 'FACEBOOK']),
  providerUserId: z.string(),
  pageId: z.string().optional(),
  accessToken: z.string().min(1),
})

export type ConnectAccountDto = z.infer<typeof ConnectAccountSchema>
