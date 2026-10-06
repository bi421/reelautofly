import { Controller, Get } from '@nestjs/common'
import { db } from '@reelautofly/db'

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return { ok: true, service: 'api' }
  }

  @Get('readyz')
  async ready() {
    await db.$queryRaw`SELECT 1`
    return { ok: true, service: 'api', database: 'ready' }
  }
}
