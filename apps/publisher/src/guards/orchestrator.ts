import type { GuardrailContext, GuardrailResult } from '@reelautofly/shared'
import { GuardrailResultSchema } from '@reelautofly/shared'
import { TokenGuard } from './token.guard'
import { RateGuard } from './rate.guard'
import { DuplicateGuard } from './duplicate.guard'
import { SpecGuard } from './spec.guard'
import { CopyrightGuard } from './copyright.guard'
import { ContentGuard } from './content.guard'
import type { TokenInput, RateInput, DuplicateInput, SpecInput, CopyrightInput, ContentInput } from '@reelautofly/shared'

export type RunAllGuardsInput = {
  token: TokenInput
  rate: RateInput
  duplicate: DuplicateInput
  spec: SpecInput
  copyright: CopyrightInput
  content: ContentInput
}

export async function runAllGuards(ctx: GuardrailContext, input: RunAllGuardsInput): Promise<GuardrailResult> {
  const details: GuardrailResult['details'] = {}
  const failedGuards: string[] = []

  const tokenResult = await TokenGuard.run(input.token)
  details.token = tokenResult
  if (!tokenResult.valid) failedGuards.push('TokenGuard')

  const rateResult = await RateGuard.run(input.rate, ctx)
  details.rate = rateResult
  if (!rateResult.allowed) failedGuards.push('RateGuard')

  const duplicateResult = await DuplicateGuard.run(input.duplicate, ctx)
  details.duplicate = duplicateResult
  if (duplicateResult.isDuplicate) failedGuards.push('DuplicateGuard')

  const specResult = await SpecGuard.run(input.spec)
  details.spec = specResult
  if (!specResult.ok) failedGuards.push('SpecGuard')

  const copyrightResult = await CopyrightGuard.run(input.copyright)
  details.copyright = copyrightResult
  if (!copyrightResult.safe) failedGuards.push('CopyrightGuard')

  const contentResult = await ContentGuard.run(input.content)
  details.content = contentResult
  if (!contentResult.approved) failedGuards.push('ContentGuard')

  const passed = failedGuards.length === 0
  return GuardrailResultSchema.parse({ passed, failedGuards, details })
}
