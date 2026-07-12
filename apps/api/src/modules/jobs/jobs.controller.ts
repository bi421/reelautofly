import { Controller, Get, Req } from '@nestjs/common'
import { db } from '@reelautofly/db'

interface JobResponse {
  id: string
  status: string
  attempts: number
  errorMessage: string | null
  scheduledAt: Date | null
  guardResult: any
  publishResult: any
  account?: {
    id: string
    provider: string
    providerUserId: string
    status: string
  }
  createdAt: Date
  updatedAt: Date
}

@Controller('jobs')
export class JobsController {
  @Get()
  async findAll(@Req() req: any): Promise<JobResponse[]> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return []
    }

    const jobs = await db.reelJob.findMany({
      where: { userId },
      include: {
        account: {
          select: {
            id: true,
            provider: true,
            providerUserId: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return jobs.map((job) => ({
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      errorMessage: job.errorMessage,
      scheduledAt: job.scheduledAt,
      guardResult: job.guardResult,
      publishResult: job.publishResult,
      account: job.account as any,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }))
  }
}
