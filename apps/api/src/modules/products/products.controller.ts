import { Controller, Post, Body, Req, Get } from '@nestjs/common'
import { db } from '@reelautofly/db'
import { z } from 'zod'
import { Queue } from 'bullmq'

const CreateProductSchema = z.object({
  originalImages: z.array(z.string()).min(1).max(5),
})

interface ProductResponse {
  id: string
  userId: string
  originalImages: string[]
  createdAt: Date
}

interface JobResponse {
  id: string
  productId: string
  userId: string
  status: string
  attempts: number
  createdAt: Date
}

interface ProductWithJobs extends ProductResponse {
  reelJobs: JobResponse[]
}

const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
}

const queue = new Queue('reel-jobs', { connection: redisConnection })

@Controller('products')
export class ProductsController {
  @Post()
  async create(@Req() req: any, @Body() body: unknown): Promise<{ product: ProductResponse; job: JobResponse }> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return { product: {} as ProductResponse, job: {} as JobResponse }
    }

    const parsed = CreateProductSchema.parse(body)

    const product = await db.product.create({
      data: {
        userId,
        originalImages: parsed.originalImages,
      },
    })

    const job = await db.reelJob.create({
      data: {
        productId: product.id,
        userId,
        status: 'QUEUED',
      },
    })

    try {
      await queue.add('render-and-publish', { jobId: job.id }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      })
    } catch (err) {
      console.error('Failed to add job to queue:', err)
    }

    return { product, job }
  }

  @Get()
  async findAll(@Req() req: any): Promise<ProductWithJobs[]> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return []
    }

    const products = await db.product.findMany({
      where: { userId },
      include: {
        reelJobs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    return products as ProductWithJobs[]
  }
}
