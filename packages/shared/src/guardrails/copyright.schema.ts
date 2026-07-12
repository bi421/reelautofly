import { z } from 'zod'

export const CopyrightInputSchema = z.object({
  audioPath: z.string().optional(),
  audioId: z.string().optional(),
})

export const CopyrightOutputSchema = z.object({
  safe: z.boolean(),
  replacementSuggestion: z.string().optional(),
})

export type CopyrightInput = z.infer<typeof CopyrightInputSchema>
export type CopyrightOutput = z.infer<typeof CopyrightOutputSchema>
