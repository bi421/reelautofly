import { ContentInputSchema, ContentOutputSchema } from '@reelautofly/shared'
import type { ContentInput, ContentOutput } from '@reelautofly/shared'

const BANNED_WORDS = new Set(['spam', 'scam', 'free money'])

export const ContentGuard = {
  name: 'ContentGuard',
  async run(input: ContentInput): Promise<ContentOutput> {
    const parsed = ContentInputSchema.parse(input)
    const reasons: string[] = []

    if (parsed.caption.length > 2200) reasons.push('Caption exceeds 2200 characters')

    for (const word of BANNED_WORDS) {
      if (parsed.caption.toLowerCase().includes(word)) reasons.push(`Banned word detected: ${word}`)
    }

    if (parsed.hashtags.length > 30) reasons.push('Too many hashtags: max 30')

    if (parsed.scriptData?.aiClone && !parsed.caption.toLowerCase().includes('ai-generated')) {
      reasons.push('AI-generated disclosure required')
    }

    return ContentOutputSchema.parse({ approved: reasons.length === 0, reasons })
  },
}
