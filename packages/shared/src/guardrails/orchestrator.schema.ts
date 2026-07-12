import { z } from 'zod'
import { TokenInputSchema, TokenOutputSchema } from './token.schema'
import { RateInputSchema, RateOutputSchema } from './rate.schema'
import { DuplicateInputSchema, DuplicateOutputSchema } from './duplicate.schema'
import { SpecInputSchema, SpecOutputSchema } from './spec.schema'
import { CopyrightInputSchema, CopyrightOutputSchema } from './copyright.schema'
import { ContentInputSchema, ContentOutputSchema } from './content.schema'

export const GuardrailDetailsSchema = z.object({
  token: TokenOutputSchema.optional(),
  rate: RateOutputSchema.optional(),
  duplicate: DuplicateOutputSchema.optional(),
  spec: SpecOutputSchema.optional(),
  copyright: CopyrightOutputSchema.optional(),
  content: ContentOutputSchema.optional(),
})

export const GuardrailResultSchema = z.object({
  passed: z.boolean(),
  failedGuards: z.array(z.string()),
  details: GuardrailDetailsSchema,
})

export type GuardrailDetails = z.infer<typeof GuardrailDetailsSchema>
export type GuardrailResult = z.infer<typeof GuardrailResultSchema>

export interface TokenGuardInput extends z.infer<typeof TokenInputSchema> {}
export interface RateGuardInput extends z.infer<typeof RateInputSchema> {}
export interface DuplicateGuardInput extends z.infer<typeof DuplicateInputSchema> {}
export interface SpecGuardInput extends z.infer<typeof SpecInputSchema> {}
export interface CopyrightGuardInput extends z.infer<typeof CopyrightInputSchema> {}
export interface ContentGuardInput extends z.infer<typeof ContentInputSchema> {}

export interface GuardrailContext {
  db: {
    reelJob: {
      count: (args: { where: { connectedAccountId: string; status: string; createdAt: { gt: Date } } }) => Promise<number>
      findFirst: (args: { where: { connectedAccountId: string; videoHash: string; createdAt: { gt: Date } } }) => Promise<{ id: string } | null>
      findMany: (args: { where: { connectedAccountId: string; videoHash: string; createdAt: { gt: Date } } | { connectedAccountId: string; captionHash: string; createdAt: { gt: Date } } }) => Promise<Array<{ id: string }>>
    }
  }
  now?: Date
}

export type GuardFn = {
  name: string
  run: (ctx: GuardrailContext, input: unknown) => Promise<unknown>
}
