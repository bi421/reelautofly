import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@reelautofly/db'

type StripeEvent = { id: string; type: string; data: { object: any } }

const PRICE_TO_PLAN: Record<string, 'PRO' | 'TEAM' | 'ENTERPRISE'> = {
  ...(process.env.STRIPE_PRICE_PRO ? { [process.env.STRIPE_PRICE_PRO]: 'PRO' } : {}),
  ...(process.env.STRIPE_PRICE_TEAM ? { [process.env.STRIPE_PRICE_TEAM]: 'TEAM' } : {}),
  ...(process.env.STRIPE_PRICE_ENTERPRISE ? { [process.env.STRIPE_PRICE_ENTERPRISE]: 'ENTERPRISE' } : {}),
}

@Injectable()
export class BillingService {
  private requireStripe() {
    const secret = process.env.STRIPE_SECRET_KEY
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.QROS_PUBLIC_BASE_URL
    if (!secret || !baseUrl) throw new InternalServerErrorException('Stripe is not configured')
    return { secret, baseUrl }
  }

  private async stripe(path: string, body: URLSearchParams) {
    const { secret } = this.requireStripe()
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const text = await response.text()
    let data: any
    try { data = JSON.parse(text) } catch { data = { error: { message: text } } }
    if (!response.ok) throw new BadRequestException(data.error?.message || 'Stripe request failed')
    return data
  }

  async createCheckout(userId: string, plan: 'PRO' | 'TEAM' | 'ENTERPRISE') {
    const price = {
      PRO: process.env.STRIPE_PRICE_PRO,
      TEAM: process.env.STRIPE_PRICE_TEAM,
      ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE,
    }[plan]
    if (!price) throw new InternalServerErrorException(`Stripe price for ${plan} is not configured`)
    const { baseUrl } = this.requireStripe()
    const user = await db.user.findUnique({ where: { id: userId }, include: { subscription: true } })
    if (!user) throw new BadRequestException('User not found')

    let customerId = user.subscription?.providerCustomerId
    if (!customerId) {
      const customer = await this.stripe('customers', new URLSearchParams({ email: user.email, name: user.name, 'metadata[userId]': user.id }))
      customerId = customer.id
      await db.subscription.upsert({
        where: { userId },
        create: { userId, providerCustomerId: customerId, plan: 'FREE', status: 'INCOMPLETE' },
        update: { providerCustomerId: customerId },
      })
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      success_url: `${baseUrl.replace(/\/$/, '')}/billing?success=1`,
      cancel_url: `${baseUrl.replace(/\/$/, '')}/billing?canceled=1`,
      'subscription_data[metadata][userId]': user.id,
      'subscription_data[metadata][plan]': plan,
      'metadata[userId]': user.id,
      'metadata[plan]': plan,
    })
    const checkoutCustomerId = customerId
    if (!checkoutCustomerId) throw new InternalServerErrorException('Stripe customer creation failed')
    params.set('customer', checkoutCustomerId)
    const session = await this.stripe('checkout/sessions', params)
    return { url: session.url, sessionId: session.id }
  }

  async createPortal(userId: string) {
    const { baseUrl } = this.requireStripe()
    const subscription = await db.subscription.findUnique({ where: { userId } })
    if (!subscription?.providerCustomerId) throw new BadRequestException('No Stripe customer found')
    const session = await this.stripe('billing_portal/sessions', new URLSearchParams({
      customer: subscription.providerCustomerId,
      return_url: `${baseUrl.replace(/\/$/, '')}/billing`,
    }))
    return { url: session.url }
  }

  verifySignature(rawBody: Buffer, header: string | undefined): boolean {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret || !header) return false
    const parts = Object.fromEntries(header.split(',').map((part) => {
      const [key, value] = part.split('=')
      return [key, value]
    }))
    const timestamp = Number(parts.t)
    const signature = parts.v1
    if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > 300) return false
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(signature, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!this.verifySignature(rawBody, signature)) throw new BadRequestException('Invalid Stripe signature')
    const event = JSON.parse(rawBody.toString('utf8')) as StripeEvent
    const payloadHash = createHash('sha256').update(rawBody).digest('hex')

    const existing = await db.billingEvent.findUnique({
      where: { provider_providerEventId: { provider: 'stripe', providerEventId: event.id } },
    })
    if (existing?.status === 'PROCESSED') return { received: true, duplicate: true }

    if (!existing) {
      await db.billingEvent.create({
        data: { provider: 'stripe', providerEventId: event.id, payloadHash, type: event.type },
      })
    }

    try {
      await this.processEvent(event)
      await db.billingEvent.updateMany({
        where: { provider: 'stripe', providerEventId: event.id },
        data: { status: 'PROCESSED', processedAt: new Date(), payloadHash },
      })
      return { received: true }
    } catch (error) {
      await db.billingEvent.updateMany({
        where: { provider: 'stripe', providerEventId: event.id },
        data: { status: 'FAILED', errorMessage: error instanceof Error ? error.message : 'Unknown error' },
      })
      throw error
    }
  }

  private async processEvent(event: StripeEvent) {
    const object = event.data.object
    if (event.type === 'checkout.session.completed') {
      const userId = object.metadata?.userId || object.client_reference_id
      if (!userId) return
      await db.subscription.upsert({
        where: { userId },
        create: {
          userId,
          providerCustomerId: object.customer,
          providerSubscriptionId: object.subscription,
          plan: object.metadata?.plan || 'FREE',
          status: 'ACTIVE',
        },
        update: {
          providerCustomerId: object.customer,
          providerSubscriptionId: object.subscription,
          plan: object.metadata?.plan || undefined,
          status: 'ACTIVE',
        },
      })
      return
    }

    if (!event.type.startsWith('customer.subscription.')) return
    const userId = object.metadata?.userId
    const providerSubscriptionId = object.id
    const priceId = object.items?.data?.[0]?.price?.id
    const plan = (object.metadata?.plan || PRICE_TO_PLAN[priceId] || 'FREE') as 'FREE' | 'PRO' | 'TEAM' | 'ENTERPRISE'
    const rawStatus = event.type === 'customer.subscription.deleted' ? 'CANCELED' : String(object.status || '').toUpperCase()
    const status = (['ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE'] as const).includes(rawStatus as any)
      ? rawStatus as 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'INCOMPLETE'
      : 'INCOMPLETE'
    if (!userId && !providerSubscriptionId) return

    const existing = await db.subscription.findFirst({
      where: userId ? { userId } : { providerSubscriptionId },
    })
    if (!existing) return

    await db.subscription.update({
      where: { id: existing.id },
      data: {
        providerCustomerId: object.customer || existing.providerCustomerId,
        providerSubscriptionId,
        plan: status === 'CANCELED' ? 'FREE' : plan,
        status,
        currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      },
    })
  }
}
