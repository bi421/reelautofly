import { DuplicateInputSchema, DuplicateOutputSchema } from '@reelautofly/shared'
import type { DuplicateInput, DuplicateOutput } from '@reelautofly/shared'
import type { GuardrailContext } from '@reelautofly/shared'

export const DuplicateGuard = {
  name: 'DuplicateGuard',
  async run(input: DuplicateInput, ctx: GuardrailContext): Promise<DuplicateOutput> {
    const parsed = DuplicateInputSchema.parse(input)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const duplicate = await ctx.db.reelJob.findFirst({
      where: {
        connectedAccountId: parsed.connectedAccountId,
        videoHash: parsed.videoHash,
        createdAt: { gt: fortyEightHoursAgo },
      },
    })

    if (duplicate) {
      return DuplicateOutputSchema.parse({ isDuplicate: true, duplicateOfJobId: duplicate.id })
    }

    return DuplicateOutputSchema.parse({ isDuplicate: false })
  },
}
