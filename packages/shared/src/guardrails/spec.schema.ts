import { z } from 'zod'

export const SpecInputSchema = z.object({
  path: z.string(),
  durationSec: z.number(),
  width: z.number(),
  height: z.number(),
  sizeMB: z.number(),
  codec: z.string().optional(),
})

export const SpecOutputSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  fix: z.enum(['transcode', 'resize', 'trim']).optional(),
})

export type SpecInput = z.infer<typeof SpecInputSchema>
export type SpecOutput = z.infer<typeof SpecOutputSchema>
