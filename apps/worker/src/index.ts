import { Queue, Worker, Job } from 'bullmq'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'node:fs'
import { db } from '@reelautofly/db'
import { renderReel } from '@reelautofly/remotion-templates'
import type { GuardrailContext } from '@reelautofly/shared'
import { runAllGuards, PublishService } from '@reelautofly/publisher'

const redisUrl = process.env.REDIS_URL
const redisConnection = redisUrl
  ? (() => {
      const parsed = new URL(redisUrl)
      return {
        host: parsed.hostname,
        port: Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379)),
        ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
        ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
        ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
      }
    })()
  : {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379'),
    }

const queue = new Queue('reel-jobs', { connection: redisConnection })

const publishService = new PublishService()

async function schedulePublishRetry(jobId: string): Promise<void> {
  const current = await db.reelJob.findUnique({ where: { id: jobId } })
  if (!current) return

  let delay = 0
  if (current.status === 'QUEUED' && current.scheduledAt) {
    delay = Math.max(0, current.scheduledAt.getTime() - Date.now())
  } else if (current.status === 'READY' && current.attempts < 3) {
    delay = Math.min(60_000, 5_000 * 2 ** Math.max(0, current.attempts - 1))
  } else {
    return
  }

  const retryId = `publish-${jobId}-${current.attempts}-${current.scheduledAt?.getTime() ?? 0}`
  await queue.add('publish-only', { jobId }, {
    jobId: retryId,
    delay,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  })
  console.log(`[worker] ${jobId} publish retry scheduled in ${delay}ms`)
}

async function processPublishOnly(jobId: string): Promise<void> {
  const current = await db.reelJob.findUnique({ where: { id: jobId } })
  if (!current) throw new Error(`ReelJob ${jobId} not found`)
  if (!['QUEUED', 'READY'].includes(current.status)) return

  await publishService.publishReelJob(jobId)
  await schedulePublishRetry(jobId)
}

function requireR2Client(): { client: S3Client; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 storage is not configured')
  }
  return {
    client: new S3Client({
      endpoint,
      region: 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  }
}

async function uploadRenderedReel(outputPath: string, jobId: string): Promise<void> {
  const { client, bucket } = requireR2Client()
  const key = `reels/${jobId}.mp4`
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(outputPath),
      ContentType: 'video/mp4',
    }))
  } finally {
    client.destroy()
  }
}

async function processJob(job: Job<{ jobId: string }>) {
  const { jobId } = job.data
  if (job.name === 'publish-only') {
    console.log(`[worker] processing publish-only job ${jobId}`)
    await processPublishOnly(jobId)
    return
  }
  console.log(`[worker] processing job ${jobId}`)

  const reelJob = await db.reelJob.findUnique({
    where: { id: jobId },
    include: { product: true, account: true },
  })

  if (!reelJob) {
    throw new Error(`ReelJob ${jobId} not found`)
  }

  if (reelJob.product.userId !== reelJob.userId || (reelJob.account && reelJob.account.userId !== reelJob.userId)) {
    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: 'Tenant integrity violation: job, product, and connected account owners do not match',
        attempts: { increment: 1 },
      },
    })
    throw new Error(`Tenant integrity violation for ReelJob ${jobId}`)
  }

  if (!reelJob.account) {
    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: 'No connected account attached to job',
        attempts: { increment: 1 },
      },
    })
    throw new Error(`ReelJob ${jobId} has no connected account`)
  }

  const product = reelJob.product
  const productName = `Product ${reelJob.productId}`

  await db.reelJob.update({
    where: { id: jobId },
    data: { status: 'SCRIPTING' },
  })
  console.log(`[worker] ${jobId} status=SCRIPTING`)

  const scriptData = {
    hook: 'New arrival',
    caption: `${productName} 🔥`,
    cta: 'Shop now',
    productName,
    price: undefined,
    videoHash: `${jobId}-script-v1`,
    captionHash: `${jobId}-caption-v1`,
  }

  await db.reelJob.update({
    where: { id: jobId },
    data: { scriptData: scriptData as any },
  })
  console.log(`[worker] ${jobId} script generated`)

  await db.reelJob.update({
    where: { id: jobId },
    data: { status: 'RENDERING' },
  })
  console.log(`[worker] ${jobId} status=RENDERING`)

  let renderResult: { outputPath: string; metadata: { duration: number; width: number; height: number; sizeMB: number } }
  try {
    renderResult = await renderReel('ProductShowcase', {
      images: product.originalImages,
      productName,
      price: undefined,
    }, jobId)
  } catch (err) {
    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: `Render failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        attempts: { increment: 1 },
      },
    })
    console.log(`[worker] ${jobId} render failed`)
    throw err
  }

  const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '')
  if (!publicBase) throw new Error('R2_PUBLIC_BASE_URL is not configured; Meta cannot fetch rendered videos')
  try {
    await uploadRenderedReel(renderResult.outputPath, jobId)
  } catch (err) {
    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: `R2 upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        attempts: { increment: 1 },
      },
    })
    throw err
  }

  const r2PublicUrl = `${publicBase}/reels/${jobId}.mp4`

  await db.reelJob.update({
    where: { id: jobId },
    data: {
      videoUrl: r2PublicUrl,
      scriptData: { ...scriptData, videoUrl: r2PublicUrl } as any,
    },
  })
  console.log(`[worker] ${jobId} rendered, videoUrl=${r2PublicUrl}`)

  await db.reelJob.update({
    where: { id: jobId },
    data: { status: 'GUARD_CHECK' },
  })
  console.log(`[worker] ${jobId} status=GUARD_CHECK`)

  const account = reelJob.account
  const guardContext: GuardrailContext = {
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

  const guardInputs = {
    token: {
      id: account?.id ?? '',
      userId: reelJob.userId,
      provider: account?.provider ?? 'INSTAGRAM',
      providerUserId: account?.providerUserId ?? '',
      pageId: account?.pageId,
      encryptedAccessToken: account?.encryptedAccessToken ?? '',
      tokenExpiresAt: account?.tokenExpiresAt,
      status: account?.status ?? 'ACTIVE',
      lastRefreshedAt: account?.lastRefreshedAt,
      createdAt: account?.createdAt ?? new Date(),
    },
    rate: {
      connectedAccountId: reelJob.connectedAccountId ?? '',
      requestedAt: new Date(),
    },
    duplicate: {
      videoHash: scriptData.videoHash,
      captionHash: scriptData.captionHash,
      connectedAccountId: reelJob.connectedAccountId ?? '',
    },
    spec: {
      path: renderResult.outputPath,
      durationSec: renderResult.metadata.duration,
      width: renderResult.metadata.width,
      height: renderResult.metadata.height,
      sizeMB: renderResult.metadata.sizeMB,
    },
    copyright: {
      audioPath: undefined,
      audioId: undefined,
    },
    content: {
      caption: scriptData.caption,
      hashtags: [],
      scriptData: { aiClone: false },
    },
  }

  const guardResult = await runAllGuards(guardContext, guardInputs as any)

  await db.reelJob.update({
    where: { id: jobId },
    data: { guardResult: guardResult as any },
  })

  if (!guardResult.passed) {
    const failedNames = guardResult.failedGuards.join(', ')
    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: `Guard check failed: ${failedNames}`,
        attempts: { increment: 1 },
      },
    })
    console.log(`[worker] ${jobId} guard check failed: ${failedNames}`)
    throw new Error(`Guard check failed: ${failedNames}`)
  }

  console.log(`[worker] ${jobId} guard check passed`)

  await db.reelJob.update({
    where: { id: jobId },
    data: { status: 'READY' },
  })
  console.log(`[worker] ${jobId} status=READY`)

  try {
    await publishService.publishReelJob(jobId)
    await schedulePublishRetry(jobId)
    const finalJob = await db.reelJob.findUnique({ where: { id: jobId } })
    if (finalJob?.status === 'PUBLISHED') {
      console.log(`[worker] ${jobId} published successfully`)
    } else if (finalJob?.status === 'FAILED') {
      console.log(`[worker] ${jobId} publish failed permanently`)
    }
  } catch (err) {
    await db.reelJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: `Worker publish orchestration failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        attempts: { increment: 1 },
      },
    })
    throw err
  }
}

async function main() {
  console.log('Worker started, listening for jobs...')

  let worker: Worker<{ jobId: string }>
  try {
    worker = new Worker(
      'reel-jobs',
      async (job: Job<{ jobId: string }>) => {
        await processJob(job)
      },
      {
        connection: redisConnection,
        concurrency: 2,
      },
    )
  } catch (err) {
    console.warn('[worker] Failed to connect to Redis, retrying in 5s...')
    await new Promise((resolve) => setTimeout(resolve, 5000))
    main()
    return
  }

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.log(`[worker] job ${job?.id} failed: ${err.message}`)
  })
}

main().catch(console.error)
