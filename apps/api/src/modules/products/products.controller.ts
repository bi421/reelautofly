import { BadRequestException, Controller, Post, Body, Req, Get, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { db } from '@reelautofly/db'
import { z } from 'zod'
import { Queue } from 'bullmq'

const CreateProductSchema = z.object({
  originalImages: z.array(z.string().min(1).max(2048)).min(1).max(5),
  connectedAccountId: z.string().min(1).optional(),
})
interface ProductResponse { id: string; userId: string; originalImages: string[]; createdAt: Date }
interface JobResponse { id: string; productId: string; userId: string; status: string; attempts: number; createdAt: Date }
interface ProductWithJobs extends ProductResponse { reelJobs: JobResponse[] }

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    const parsed = new URL(redisUrl)
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      throw new Error('REDIS_URL must use redis:// or rediss://')
    }
    return {
      host: parsed.hostname,
      port: Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379)),
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is required in production')
  }
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
  }
}

const queue = new Queue('reel-jobs', { connection: getRedisConnection() })

@Controller('products')
export class ProductsController {
  @Post()
  async create(@Req() req: any, @Body() body: unknown): Promise<{ product: ProductResponse; job: JobResponse }> {
    const result = CreateProductSchema.safeParse(body)
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT',
        message: 'Invalid product payload',
        issues: result.error.issues,
      })
    }
    const parsed = result.data
    const subscription = await db.subscription.findUnique({ where: { userId: req.userId } })
    const plan = subscription?.status === 'ACTIVE' ? subscription.plan : 'FREE'
    const limits = { FREE: 3, PRO: 100, TEAM: 500, ENTERPRISE: 10000 } as const
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1); startOfMonth.setUTCHours(0, 0, 0, 0)
    const used = await db.reelJob.count({ where: { userId: req.userId, createdAt: { gte: startOfMonth } } })
    if (used >= limits[plan]) throw new ForbiddenException({ code: 'MONTHLY_LIMIT_REACHED', plan, limit: limits[plan], used })

    const account = parsed.connectedAccountId
      ? await db.account.findFirst({ where: { id: parsed.connectedAccountId, userId: req.userId, status: 'ACTIVE' } })
      : await db.account.findFirst({ where: { userId: req.userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
    if (!account) throw new BadRequestException('Connect an active Meta account before creating a Reel job')

    const { product, job } = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { userId: req.userId, originalImages: parsed.originalImages },
      })
      const job = await tx.reelJob.create({
        data: {
          productId: product.id,
          userId: req.userId,
          connectedAccountId: account.id,
          status: 'QUEUED',
        },
      })
      return { product, job }
    })

    try {
      await queue.add('render-and-publish', { jobId: job.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      })
    } catch (err) {
      await db.reelJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: `Queue submission failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      })
      throw new ServiceUnavailableException('Job queue is temporarily unavailable')
    }

    return { product, job }
  }

  @Get()
  async findAll(@Req() req: any): Promise<ProductWithJobs[]> {
    const products = await db.product.findMany({ where: { userId: req.userId }, include: { reelJobs: { orderBy: { createdAt: 'desc' } } } })
    return products as ProductWithJobs[]
  }
}
