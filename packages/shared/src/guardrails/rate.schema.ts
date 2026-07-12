import { z } from 'zod'

export const RateInputSchema = z.object({
  connectedAccountId: z.string(),
  requestedAt: z.coerce.date(),
})

export const RateOutputSchema = z.object({
  allowed: z.boolean(),
  nextAllowedAt: z.coerce.date().optional(),
  currentCount: z.number(),
})

export type RateInput = z.infer<typeof RateInputSchema>
export type RateOutput = z.infer<typeof RateOutputSchema>
