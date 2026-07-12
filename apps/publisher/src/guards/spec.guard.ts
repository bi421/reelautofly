import { SpecInputSchema, SpecOutputSchema } from '@reelautofly/shared'
import type { SpecInput, SpecOutput } from '@reelautofly/shared'

export const SpecGuard = {
  name: 'SpecGuard',
  async run(input: SpecInput): Promise<SpecOutput> {
    const parsed = SpecInputSchema.parse(input)
    const reasons: string[] = []

    if (parsed.width !== 1080) reasons.push(`width must be 1080, got ${parsed.width}`)
    if (parsed.height !== 1920) reasons.push(`height must be 1920, got ${parsed.height}`)
    if (parsed.durationSec < 3 || parsed.durationSec > 90) reasons.push(`duration must be 3-90s, got ${parsed.durationSec}`)
    if (parsed.sizeMB >= 100) reasons.push(`size must be <100MB, got ${parsed.sizeMB}MB`)
    if (parsed.codec && !['H264', 'AAC', 'h264', 'aac'].includes(parsed.codec)) reasons.push(`codec must be H264/AAC, got ${parsed.codec}`)

    if (reasons.length === 0) {
      return SpecOutputSchema.parse({ ok: true })
    }

    let fix: SpecOutput['fix'] | undefined
    if (parsed.width !== 1080 || parsed.height !== 1920) fix = 'resize'
    else if (parsed.durationSec < 3 || parsed.durationSec > 90) fix = 'trim'
    else if (parsed.codec && !['H264', 'AAC', 'h264', 'aac'].includes(parsed.codec)) fix = 'transcode'

    return SpecOutputSchema.parse({ ok: false, reason: reasons.join('; '), fix })
  },
}
