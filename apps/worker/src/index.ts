import { Queue, Worker, Job } from 'bullmq'
import { db } from '@reelautofly/db'
import { renderReel } from '@reelautofly/remotion-templates'
import type { GuardrailContext } from '@reelautofly/shared'
import { runAllGuards, PublishService } from '@reelautofly/publisher'

const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
}

const queue = new Queue('reel-jobs', { connection: redisConnection })

const publishService = new PublishService()

async function processJob(job: Job<{ jobId: string }>) {
  const { jobId } = job.data
  console.log(`[worker] processing job ${jobId}`)

  const reelJob = await db.reelJob.findUnique({
    where: { id: jobId },
    include: { product: true, account: true },
  })

  if (!reelJob) {
    throw new Error(`ReelJob ${jobId} not found`)
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

  const r2PublicUrl = `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/reels/${jobId}.mp4`

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
    console.log(`[worker] ${jobId} published successfully`)
  } catch (err) {
    const currentJob = await db.reelJob.findUnique({ where: { id: jobId } })
    const currentAttempts = currentJob?.attempts ?? 0

    if (currentAttempts < 3) {
      await db.reelJob.update({
        where: { id: jobId },
        data: { status: 'READY' },
      })
      console.log(`[worker] ${jobId} publish failed, retrying (attempt ${currentAttempts + 1}/3)`)
      throw err
    } else {
      await db.reelJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      })
      console.log(`[worker] ${jobId} publish failed permanently after ${currentAttempts} attempts`)
      throw err
    }
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
