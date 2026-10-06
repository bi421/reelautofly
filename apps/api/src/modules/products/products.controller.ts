import { Controller, Post, Body, Req, Get } from '@nestjs/common'
import { db } from '@reelautofly/db'
import { z } from 'zod'
import { Queue } from 'bullmq'

const CreateProductSchema = z.object({
  originalImages: z.array(z.string().url()).min(1).max(5),
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
    const parsed = CreateProductSchema.parse(body)

    const product = await db.product.create({
      data: { userId: req.userId, originalImages: parsed.originalImages },
    })

    const job = await db.reelJob.create({
      data: { productId: product.id, userId: req.userId, status: 'QUEUED' },
    })

    await queue.add('render-and-publish', { jobId: job.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    })

    return { product, job }
  }

  @Get()
  async findAll(@Req() req: any): Promise<ProductWithJobs[]> {
    const products = await db.product.findMany({
      where: { userId: req.userId },
      include: { reelJobs: { orderBy: { createdAt: 'desc' } } },
    })
    return products as ProductWithJobs[]
  }
}
