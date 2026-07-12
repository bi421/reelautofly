import { z } from 'zod'

export const UploadSchema = z.object({
  userId: z.string(),
  assetId: z.string(),
})

export type Upload = z.infer<typeof UploadSchema>

export const JobStatusSchema = z.enum(['queued', 'scripting', 'rendering', 'guarding', 'publishing', 'done', 'failed'])
export type JobStatus = z.infer<typeof JobStatusSchema>

export * from './guardrails/index'
export * from './crypto/encryption'
