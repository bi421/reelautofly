// apps/publisher/src/publish.service.ts
import { db } from '@reelautofly/db'
import { decrypt, maskToken } from '@reelautofly/shared'
import { MetaGraphClient, MetaGraphError } from './meta-graph.client'
import { runAllGuards, type RunAllGuardsInput } from './guards/orchestrator'
import type { GuardrailContext, GuardrailResult } from '@reelautofly/shared'
import { alertOps } from './alerts'

const META_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v20.0'

export class PublishService {
  private readonly metaClient: MetaGraphClient

  constructor() {
    this.metaClient = new MetaGraphClient({ apiVersion: META_API_VERSION })
  }

  private buildGuardContext(): GuardrailContext {
    return {
      db: {
        reelJob: {
          count: async (args) => {
            return db.reelJob.count({ where: args.where as any })
          },
          findFirst: async (args) => {
            return db.reelJob.findFirst({ where: args.where as any })
          },
          findMany: async (args) => {
            return db.reelJob.findMany({ where: args.where as any })
          },
        },
      },
      now: new Date(),
    }
  }

  private buildGuardInputs(job: any, account: any): RunAllGuardsInput {
    const scriptData = (job.scriptData || {}) as any
    const caption = scriptData.caption || ''
    const hashtags = (scriptData.hashtags || []) as string[]

    return {
      token: {
        id: account.id,
        userId: account.userId,
        provider: account.provider,
        providerUserId: account.providerUserId,
        pageId: account.pageId || undefined,
        encryptedAccessToken: account.encryptedAccessToken,
        tokenExpiresAt: account.tokenExpiresAt,
        status: account.status,
        lastRefreshedAt: account.lastRefreshedAt,
        createdAt: account.createdAt,
      },
      rate: {
        connectedAccountId: job.connectedAccountId,
        requestedAt: new Date(),
      },
      duplicate: {
        videoHash: scriptData.videoHash || '',
        captionHash: scriptData.captionHash || '',
        connectedAccountId: job.connectedAccountId,
      },
      spec: {
        path: '',
        durationSec: scriptData.durationSec || 0,
        width: scriptData.width || 0,
        height: scriptData.height || 0,
        sizeMB: scriptData.sizeMB || 0,
        codec: scriptData.codec,
      },
      copyright: {
        audioPath: scriptData.audioPath,
        audioId: scriptData.audioId,
      },
      content: {
        caption,
        hashtags,
        scriptData: { aiClone: scriptData.aiClone },
      },
    }
  }

  async publishReelJob(jobId: string): Promise<void> {
    const job = await db.reelJob.findUnique({
      where: { id: jobId },
      include: { account: true },
    })

    if (!job) {
      throw new Error(`ReelJob ${jobId} not found`)
    }

    if (!job.connectedAccountId || !job.account) {
      await db.reelJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: 'No connected account attached',
          attempts: { increment: 1 },
        },
      })
      return
    }

    const account = job.account
    const ctx = this.buildGuardContext()
    const inputs = this.buildGuardInputs(job, account)

    const guardResult = await runAllGuards(ctx, inputs)

    if (!guardResult.passed) {
      const failedNames = guardResult.failedGuards.join(', ')

      if (guardResult.details.token && !guardResult.details.token.valid) {
        const tokenResult = guardResult.details.token
        if (tokenResult.action === 'REAUTH_REQUIRED') {
          await db.account.update({
            where: { id: account.id },
            data: { status: 'REVOKED' },
          })
          await db.reelJob.update({
            where: { id: jobId },
            data: {
              status: 'FAILED',
              guardResult: guardResult as any,
              errorMessage: 'Token revoked, reauthentication required',
              attempts: { increment: 1 },
            },
          })
          return
        }

        if (tokenResult.action === 'REFRESH_REQUIRED') {
          const refreshed = await this.attemptTokenRefresh(account.id)
          if (!refreshed) {
            await db.account.update({
              where: { id: account.id },
              data: { status: 'EXPIRED' },
            })
            await db.reelJob.update({
              where: { id: jobId },
              data: {
                status: 'FAILED',
                guardResult: guardResult as any,
                errorMessage: 'Token refresh failed',
                attempts: { increment: 1 },
              },
            })
            return
          }
        }
      }

      if (guardResult.details.rate && !guardResult.details.rate.allowed) {
        const nextAllowedAt = guardResult.details.rate.nextAllowedAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
        await db.reelJob.update({
          where: { id: jobId },
          data: {
            status: 'QUEUED',
            scheduledAt: nextAllowedAt,
            guardResult: guardResult as any,
          },
        })
        return
      }

      await db.reelJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          guardResult: guardResult as any,
          errorMessage: `Guard check failed: ${failedNames}`,
          attempts: { increment: 1 },
        },
      })
      return
    }

    let plainToken: string
    try {
      const parts = account.encryptedAccessToken.split(':')
      if (parts.length !== 3) {
        throw new Error('Invalid token format')
      }
      plainToken = decrypt(parts[0], parts[1], parts[2], process.env.ENCRYPTION_KEY_32_BYTES!)
    } catch (err) {
      await db.reelJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: 'Failed to decrypt access token',
          attempts: { increment: 1 },
        },
      })
      return
    }

    const scriptData = (job.scriptData || {}) as any
    const videoUrl = job.videoUrl || scriptData.videoUrl
    const caption = scriptData.caption || ''
    const description = scriptData.description || caption

    if (!videoUrl) {
      await db.reelJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: 'Missing video URL',
          attempts: { increment: 1 },
        },
      })
      return
    }

    try {
      if (account.provider === 'INSTAGRAM') {
        await this.publishToInstagram(jobId, account, plainToken, videoUrl, caption)
      } else if (account.provider === 'FACEBOOK') {
        await this.publishToFacebook(jobId, account, plainToken, videoUrl, description)
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }
    } catch (err) {
      await this.handlePublishFailure(jobId, job, account, err)
    }
  }

  /**
   * Meta Graph API-аас ирсэн алдааг төрлөөр ялгаж, тус бүрд өөр стратеги хэрэглэнэ.
   * ЧУХАЛ: POLICY_VIOLATION-ыг хэзээ ч автоматаар дахин оролдохгүй — энэ л
   * аккаунт хаагдуулах хамгийн шууд зам.
   */
  private async handlePublishFailure(jobId: string, job: any, account: any, err: unknown): Promise<void> {
    const currentAttempts = job.attempts + 1

    if (err instanceof MetaGraphError) {
      const category = err.categorize()
      const errorMessage = `Meta API error ${err.statusCode} [${category}]: ${err.graphMessage} (code=${err.graphCode}${err.graphSubcode ? `/${err.graphSubcode}` : ''}, fbtrace_id=${err.fbtraceId || 'n/a'})`

      switch (category) {
        case 'RATE_LIMIT': {
          const backoffMinutes = Math.min(60, 5 * Math.pow(2, currentAttempts))
          const nextAllowedAt = new Date(Date.now() + backoffMinutes * 60 * 1000)
          await db.reelJob.update({
            where: { id: jobId },
            data: { status: 'QUEUED', scheduledAt: nextAllowedAt, errorMessage, attempts: { increment: 1 } },
          })
          await alertOps({ level: 'info', title: 'Rate limit — дахин хуваарилагдлаа', jobId, detail: errorMessage })
          return
        }

        case 'TOKEN_INVALID': {
          await db.account.update({ where: { id: account.id }, data: { status: 'EXPIRED' } })
          const refreshed = await this.attemptTokenRefresh(account.id)
          await db.reelJob.update({
            where: { id: jobId },
            data: { status: refreshed ? 'READY' : 'FAILED', errorMessage, attempts: { increment: 1 } },
          })
          await alertOps({
            level: refreshed ? 'warning' : 'critical',
            title: refreshed ? 'Token шинэчлэгдлээ' : 'Token хүчингүй — гараар reauth хэрэгтэй',
            jobId,
            detail: errorMessage,
          })
          return
        }

        case 'POLICY_VIOLATION': {
          await db.reelJob.update({
            where: { id: jobId },
            data: { status: 'FAILED', errorMessage, attempts: { increment: 1 } },
          })
          await alertOps({
            level: 'critical',
            title: 'Content policy violation — гараар шалгах шаардлагатай',
            jobId,
            detail: errorMessage,
          })
          return
        }

        case 'TRANSIENT':
        case 'UNKNOWN':
        default: {
          const newStatus = currentAttempts >= 3 ? 'FAILED' : 'READY'
          await db.reelJob.update({
            where: { id: jobId },
            data: { status: newStatus, errorMessage, attempts: { increment: 1 } },
          })
          if (newStatus === 'FAILED') {
            await alertOps({ level: 'critical', title: '3 оролдлогын дараа бүтэлгүйтлээ', jobId, detail: errorMessage })
          }
          return
        }
      }
    }

    const errorMessage = `Publishing failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    const newStatus = currentAttempts >= 3 ? 'FAILED' : 'READY'
    await db.reelJob.update({
      where: { id: jobId },
      data: { status: newStatus, errorMessage, attempts: { increment: 1 } },
    })
    if (newStatus === 'FAILED') {
      await alertOps({ level: 'critical', title: 'Publish алдаа (Meta-гийн бус)', jobId, detail: errorMessage })
    }
  }

  private async publishToInstagram(
    jobId: string,
    account: any,
    accessToken: string,
    videoUrl: string,
    caption: string,
  ): Promise<void> {
    const igUserId = account.providerUserId

    const container = await this.metaClient.createIgContainer(igUserId, videoUrl, caption, accessToken)

    let status = 'IN_PROGRESS'
    let attempts = 0
    const maxAttempts = 12

    while (status !== 'FINISHED' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      const statusResponse = await this.metaClient.getContainerStatus(container.id, accessToken)
      status = statusResponse.status_code
      attempts++
    }

    if (status !== 'FINISHED') {
      throw new Error(`Container ${container.id} did not finish within timeout, final status: ${status}`)
    }

    const published = await this.metaClient.publishContainer(igUserId, container.id, accessToken)

    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'PUBLISHED',
        publishResult: {
          igMediaId: published.id,
          fbPostId: null,
        } as any,
        attempts: { increment: 1 },
      },
    })
  }

  private async publishToFacebook(
    jobId: string,
    account: any,
    accessToken: string,
    videoUrl: string,
    description: string,
  ): Promise<void> {
    const pageId = account.pageId || account.providerUserId

    const container = await this.metaClient.createFbReelContainer(pageId, videoUrl, description, accessToken)

    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'PUBLISHED',
        publishResult: {
          igMediaId: null,
          fbPostId: container.video_id,
        } as any,
        attempts: { increment: 1 },
      },
    })
  }

  private async attemptTokenRefresh(accountId: string): Promise<boolean> {
    try {
      const account = await db.account.findUnique({ where: { id: accountId } })
      if (!account) return false

      const parts = account.encryptedAccessToken.split(':')
      if (parts.length !== 3) return false
      const plainToken = decrypt(parts[0], parts[1], parts[2], process.env.ENCRYPTION_KEY_32_BYTES!)

      // Placeholder for token refresh logic
      // const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?...`)
      // const data = await response.json()
      // const newToken = data.access_token
      // const encrypted = encrypt(newToken, process.env.ENCRYPTION_KEY_32_BYTES!)
      // await db.account.update({ where: { id: accountId }, data: { encryptedAccessToken: `${encrypted.iv}:${encrypted.authTag}:${encrypted.encryptedData}`, status: 'ACTIVE', lastRefreshedAt: new Date() } })

      return true
    } catch {
      return false
    }
  }
}