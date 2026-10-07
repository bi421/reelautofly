import { z } from 'zod'

export const UploadSchema = z.object({
  userId: z.string(),
  assetId: z.string(),
})

export type Upload = z.infer<typeof UploadSchema>

export const JobStatusSchema = z.enum([
  'QUEUED',
  'SCRIPTING',
  'RENDERING',
  'GUARD_CHECK',
  'READY',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
])
export type JobStatus = z.infer<typeof JobStatusSchema>

export * from './guardrails/index'
export * from './crypto/encryption'
