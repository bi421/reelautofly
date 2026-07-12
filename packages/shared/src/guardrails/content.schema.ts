import { z } from 'zod'

export const ContentInputSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  scriptData: z.object({ aiClone: z.boolean().optional() }).optional(),
})

export const ContentOutputSchema = z.object({
  approved: z.boolean(),
  reasons: z.array(z.string()),
})

export type ContentInput = z.infer<typeof ContentInputSchema>
export type ContentOutput = z.infer<typeof ContentOutputSchema>
