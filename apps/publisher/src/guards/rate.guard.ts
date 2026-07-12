import { RateInputSchema, RateOutputSchema } from '@reelautofly/shared'
import type { RateInput, RateOutput } from '@reelautofly/shared'
import type { GuardrailContext } from '@reelautofly/shared'

const HARD_CAP_THRESHOLD = 25
const SOFT_CAP_THRESHOLD = 10
const SOFT_CAP_BACKOFF_HOURS = 4
const HARD_CAP_BACKOFF_HOURS = 24

export const RateGuard = {
  name: 'RateGuard',
  async run(input: RateInput, ctx: GuardrailContext): Promise<RateOutput> {
    const parsed = RateInputSchema.parse(input)
    const twentyFourHoursAgo = new Date(parsed.requestedAt.getTime() - 24 * 60 * 60 * 1000)

    const count = await ctx.db.reelJob.count({
      where: {
        connectedAccountId: parsed.connectedAccountId,
        status: 'PUBLISHED',
        createdAt: { gt: twentyFourHoursAgo },
      },
    })

    if (count >= HARD_CAP_THRESHOLD) {
      const nextAllowedAt = new Date(parsed.requestedAt.getTime() + HARD_CAP_BACKOFF_HOURS * 60 * 60 * 1000)
      return RateOutputSchema.parse({ allowed: false, nextAllowedAt, currentCount: count })
    }

    if (count >= SOFT_CAP_THRESHOLD) {
      const nextAllowedAt = new Date(parsed.requestedAt.getTime() + SOFT_CAP_BACKOFF_HOURS * 60 * 60 * 1000)
      return RateOutputSchema.parse({ allowed: false, nextAllowedAt, currentCount: count })
    }

    return RateOutputSchema.parse({ allowed: true, currentCount: count })
  },
}