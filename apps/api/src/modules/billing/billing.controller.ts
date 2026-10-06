import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common'
import { z } from 'zod'
import { BillingService } from './billing.service'

const CheckoutSchema = z.object({ plan: z.enum(['PRO', 'TEAM', 'ENTERPRISE']) })

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout')
  checkout(@Req() req: any, @Body() body: unknown) {
    const { plan } = CheckoutSchema.parse(body)
    return this.billing.createCheckout(req.userId, plan)
  }

  @Post('portal')
  portal(@Req() req: any) {
    return this.billing.createPortal(req.userId)
  }

  @Get('subscription')
  async subscription(@Req() req: any) {
    const { db } = await import('@reelautofly/db')
    return db.subscription.findUnique({
      where: { userId: req.userId },
      select: { plan: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    })
  }

  @Post('webhook')
  webhook(@Req() req: any, @Headers('stripe-signature') signature?: string) {
    const rawBody = req.rawBody as Buffer | undefined
    if (!rawBody) throw new Error('Raw webhook body is unavailable')
    return this.billing.handleWebhook(rawBody, signature)
  }
}
