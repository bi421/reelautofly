import { z } from 'zod'

export const DuplicateInputSchema = z.object({
  videoHash: z.string(),
  captionHash: z.string(),
  connectedAccountId: z.string(),
})

export const DuplicateOutputSchema = z.object({
  isDuplicate: z.boolean(),
  duplicateOfJobId: z.string().optional(),
})

export type DuplicateInput = z.infer<typeof DuplicateInputSchema>
export type DuplicateOutput = z.infer<typeof DuplicateOutputSchema>
