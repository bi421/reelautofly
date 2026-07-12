import { CopyrightInputSchema, CopyrightOutputSchema } from '@reelautofly/shared'
import type { CopyrightInput, CopyrightOutput } from '@reelautofly/shared'

const BLOCKLISTED_AUDIO_IDS = new Set([
  'tiktok-trend-001',
  'tiktok-trend-002',
])

export const CopyrightGuard = {
  name: 'CopyrightGuard',
  async run(input: CopyrightInput): Promise<CopyrightOutput> {
    const parsed = CopyrightInputSchema.parse(input)

    if (parsed.audioId) {
      const normalized = parsed.audioId.toLowerCase()
      if (normalized.includes('tiktok') || BLOCKLISTED_AUDIO_IDS.has(parsed.audioId)) {
        return CopyrightOutputSchema.parse({
          safe: false,
          replacementSuggestion: 'Use royalty-free audio or Meta Sound Collection',
        })
      }
    }

    return CopyrightOutputSchema.parse({ safe: true })
  },
}
