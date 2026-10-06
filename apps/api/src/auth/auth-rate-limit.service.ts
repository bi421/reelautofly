import { Injectable, ServiceUnavailableException, TooManyRequestsException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import Redis from 'ioredis'

const WINDOW_SECONDS = 15 * 60
const LOGIN_LIMIT = 10
const SIGNUP_LIMIT = 5

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`

function digest(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

function clientIp(req: any): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

@Injectable()
export class AuthRateLimitService {
  private readonly redis: Redis

  constructor() {
    const url = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL
    const host = process.env.REDIS_HOST
    const port = process.env.REDIS_PORT || '6379'
    if (!url && !host) throw new ServiceUnavailableException('Authentication rate limiter is not configured')
    this.redis = url
      ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 })
      : new Redis({ host, port: Number(port), lazyConnect: true, maxRetriesPerRequest: 1 })
  }

  async assertAllowed(action: 'login' | 'signup', req: any, email: string): Promise<void> {
    const limit = action === 'login' ? LOGIN_LIMIT : SIGNUP_LIMIT
    const prefix = 'auth:' + action
    const keys = [
      prefix + ':ip:' + digest(clientIp(req)),
      prefix + ':email:' + digest(email),
    ]

    try {
      if (this.redis.status === 'wait') await this.redis.connect()
      const counts = await Promise.all(keys.map((key) => this.redis.eval(INCREMENT_SCRIPT, 1, key, WINDOW_SECONDS)))
      const count = Math.max(...counts.map(Number))
      if (count > limit) {
        throw new TooManyRequestsException({
          code: 'AUTH_RATE_LIMITED',
          message: 'Too many authentication attempts. Try again later.',
          retryAfterSeconds: WINDOW_SECONDS,
        })
      }
    } catch (error) {
      if (error instanceof TooManyRequestsException) throw error
      throw new ServiceUnavailableException('Authentication rate limiter unavailable')
    }
  }
}