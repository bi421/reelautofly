import { describe, it, expect } from 'vitest'
import { TokenGuard } from '../token.guard'
import { RateGuard } from '../rate.guard'
import { DuplicateGuard } from '../duplicate.guard'
import { SpecGuard } from '../spec.guard'
import { CopyrightGuard } from '../copyright.guard'
import { ContentGuard } from '../content.guard'
import { runAllGuards } from '../orchestrator'
import type { GuardrailContext } from '@reelautofly/shared'

function makeTokenInput(overrides: Partial<Parameters<typeof TokenGuard.run>[0]> = {}) {
  return {
    id: 'acc_1',
    userId: 'user_1',
    provider: 'INSTAGRAM' as const,
    providerUserId: 'ig_1',
    encryptedAccessToken: 'enc:iv:tag',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeCtx(overrides: Partial<GuardrailContext['db']['reelJob']> = {}): GuardrailContext {
  return {
    db: {
      reelJob: {
        count: async () => 0,
        findFirst: async () => null,
        findMany: async () => [],
        ...overrides,
      },
    },
    now: new Date('2026-07-12'),
  }
}

describe('TokenGuard', () => {
  it('REVOKED status -> invalid, REAUTH_REQUIRED', async () => {
    const result = await TokenGuard.run(makeTokenInput({ status: 'REVOKED' }))
    expect(result.valid).toBe(false)
    expect(result.action).toBe('REAUTH_REQUIRED')
  })

  it('EXPIRED status -> invalid, REFRESH_REQUIRED', async () => {
    const result = await TokenGuard.run(makeTokenInput({ status: 'EXPIRED' }))
    expect(result.valid).toBe(false)
    expect(result.action).toBe('REFRESH_REQUIRED')
  })

  it('tokenExpiresAt within 7 days -> invalid, REFRESH_REQUIRED', async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    const result = await TokenGuard.run(makeTokenInput({ tokenExpiresAt: soon }))
    expect(result.valid).toBe(false)
    expect(result.action).toBe('REFRESH_REQUIRED')
  })

  it('ACTIVE status, no near expiry -> valid', async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const result = await TokenGuard.run(makeTokenInput({ tokenExpiresAt: farFuture }))
    expect(result.valid).toBe(true)
  })
})

describe('RateGuard', () => {
  it('count below 10 -> allowed true', async () => {
    const ctx = makeCtx({ count: async () => 5 })
    const result = await RateGuard.run({ connectedAccountId: 'acc_1', requestedAt: new Date() }, ctx)
    expect(result.allowed).toBe(true)
    expect(result.currentCount).toBe(5)
  })

  it('count 10-24 -> soft block, ~4h backoff', async () => {
    const requestedAt = new Date('2026-07-12T00:00:00Z')
    const ctx = makeCtx({ count: async () => 12 })
    const result = await RateGuard.run({ connectedAccountId: 'acc_1', requestedAt }, ctx)
    expect(result.allowed).toBe(false)
    expect(result.nextAllowedAt?.getTime()).toBe(requestedAt.getTime() + 4 * 60 * 60 * 1000)
  })

  it('count >= 25 -> hard block, 24h backoff', async () => {
    const requestedAt = new Date('2026-07-12T00:00:00Z')
    const ctx = makeCtx({ count: async () => 25 })
    const result = await RateGuard.run({ connectedAccountId: 'acc_1', requestedAt }, ctx)
    expect(result.allowed).toBe(false)
    expect(result.nextAllowedAt?.getTime()).toBe(requestedAt.getTime() + 24 * 60 * 60 * 1000)
  })

  it('soft block (10-24) waits shorter than hard block (25+)', async () => {
    const requestedAt = new Date('2026-07-12T00:00:00Z')
    const softCtx = makeCtx({ count: async () => 15 })
    const hardCtx = makeCtx({ count: async () => 30 })
    const soft = await RateGuard.run({ connectedAccountId: 'acc_1', requestedAt }, softCtx)
    const hard = await RateGuard.run({ connectedAccountId: 'acc_1', requestedAt }, hardCtx)
    expect(soft.nextAllowedAt!.getTime()).toBeLessThan(hard.nextAllowedAt!.getTime())
  })
})

describe('DuplicateGuard', () => {
  it('no existing job with same videoHash -> not duplicate', async () => {
    const ctx = makeCtx({ findFirst: async () => null })
    const result = await DuplicateGuard.run(
      { videoHash: 'hash_a', captionHash: 'cap_a', connectedAccountId: 'acc_1' },
      ctx,
    )
    expect(result.isDuplicate).toBe(false)
  })

  it('existing job within 48h with same videoHash -> duplicate', async () => {
    const ctx = makeCtx({ findFirst: async () => ({ id: 'job_prev' }) })
    const result = await DuplicateGuard.run(
      { videoHash: 'hash_a', captionHash: 'cap_a', connectedAccountId: 'acc_1' },
      ctx,
    )
    expect(result.isDuplicate).toBe(true)
    expect(result.duplicateOfJobId).toBe('job_prev')
  })
})

describe('SpecGuard', () => {
  const validSpec = { path: '/tmp/video.mp4', durationSec: 15, width: 1080, height: 1920, sizeMB: 20, codec: 'H264' }

  it('valid 9:16 spec -> ok', async () => {
    const result = await SpecGuard.run(validSpec)
    expect(result.ok).toBe(true)
  })

  it('wrong aspect ratio -> fail with resize fix', async () => {
    const result = await SpecGuard.run({ ...validSpec, width: 1920, height: 1080 })
    expect(result.ok).toBe(false)
    expect(result.fix).toBe('resize')
  })

  it('duration out of range -> fail with trim fix', async () => {
    const result = await SpecGuard.run({ ...validSpec, durationSec: 120 })
    expect(result.ok).toBe(false)
    expect(result.fix).toBe('trim')
  })

  it('size >= 100MB -> fail', async () => {
    const result = await SpecGuard.run({ ...validSpec, sizeMB: 150 })
    expect(result.ok).toBe(false)
  })

  it('unsupported codec -> fail with transcode fix', async () => {
    const result = await SpecGuard.run({ ...validSpec, codec: 'VP9' })
    expect(result.ok).toBe(false)
    expect(result.fix).toBe('transcode')
  })
})

describe('CopyrightGuard', () => {
  it('no audioId -> safe', async () => {
    const result = await CopyrightGuard.run({})
    expect(result.safe).toBe(true)
  })

  it('audioId containing "tiktok" -> unsafe', async () => {
    const result = await CopyrightGuard.run({ audioId: 'tiktok-viral-sound-99' })
    expect(result.safe).toBe(false)
    expect(result.replacementSuggestion).toBeDefined()
  })

  it('blocklisted audioId -> unsafe', async () => {
    const result = await CopyrightGuard.run({ audioId: 'tiktok-trend-001' })
    expect(result.safe).toBe(false)
  })

  it('unrelated audioId -> safe', async () => {
    const result = await CopyrightGuard.run({ audioId: 'my-own-music-track' })
    expect(result.safe).toBe(true)
  })
})

describe('ContentGuard', () => {
  it('normal caption -> approved', async () => {
    const result = await ContentGuard.run({ caption: 'Шинэ бүтээгдэхүүн гарлаа!', hashtags: ['#shop', '#mongolia'] })
    expect(result.approved).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('caption over 2200 chars -> rejected', async () => {
    const result = await ContentGuard.run({ caption: 'a'.repeat(2201), hashtags: [] })
    expect(result.approved).toBe(false)
    expect(result.reasons.some((r) => r.includes('2200'))).toBe(true)
  })

  it('banned word present -> rejected', async () => {
    const result = await ContentGuard.run({ caption: 'This is a scam offer', hashtags: [] })
    expect(result.approved).toBe(false)
    expect(result.reasons.some((r) => r.includes('scam'))).toBe(true)
  })

  it('more than 30 hashtags -> rejected', async () => {
    const hashtags = Array.from({ length: 31 }, (_, i) => `#tag${i}`)
    const result = await ContentGuard.run({ caption: 'ok', hashtags })
    expect(result.approved).toBe(false)
  })

  it('aiClone true without disclosure -> rejected', async () => {
    const result = await ContentGuard.run({
      caption: 'Check this out',
      hashtags: [],
      scriptData: { aiClone: true },
    })
    expect(result.approved).toBe(false)
    expect(result.reasons.some((r) => r.includes('AI-generated'))).toBe(true)
  })

  it('aiClone true WITH disclosure -> approved', async () => {
    const result = await ContentGuard.run({
      caption: 'Check this out (ai-generated)',
      hashtags: [],
      scriptData: { aiClone: true },
    })
    expect(result.approved).toBe(true)
  })
})

describe('runAllGuards', () => {
  const baseInput = {
    token: makeTokenInput({ tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }),
    rate: { connectedAccountId: 'acc_1', requestedAt: new Date() },
    duplicate: { videoHash: 'hash_a', captionHash: 'cap_a', connectedAccountId: 'acc_1' },
    spec: { path: '/tmp/v.mp4', durationSec: 15, width: 1080, height: 1920, sizeMB: 20, codec: 'H264' },
    copyright: { audioId: 'my-own-track' },
    content: { caption: 'Good caption', hashtags: ['#tag'] },
  }

  it('all guards pass -> overall passed = true', async () => {
    const ctx = makeCtx()
    const result = await runAllGuards(ctx, baseInput)
    expect(result.passed).toBe(true)
    expect(result.failedGuards).toHaveLength(0)
  })

  it('one guard fails -> overall passed = false, name listed', async () => {
    const ctx = makeCtx()
    const result = await runAllGuards(ctx, {
      ...baseInput,
      content: { caption: 'This is a scam', hashtags: [] },
    })
    expect(result.passed).toBe(false)
    expect(result.failedGuards).toContain('ContentGuard')
  })

  it('multiple guards fail -> all listed', async () => {
    const ctx = makeCtx({ findFirst: async () => ({ id: 'dup_job' }) })
    const result = await runAllGuards(ctx, {
      ...baseInput,
      token: makeTokenInput({ status: 'REVOKED' }),
      content: { caption: 'scam', hashtags: [] },
    })
    expect(result.passed).toBe(false)
    expect(result.failedGuards).toContain('TokenGuard')
    expect(result.failedGuards).toContain('DuplicateGuard')
    expect(result.failedGuards).toContain('ContentGuard')
  })
})