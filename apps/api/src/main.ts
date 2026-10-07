import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { AuthGuard } from './auth/auth.guard'

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=')
    if (index < 0) return [part.trim(), '']
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    try {
      return [name, decodeURIComponent(value)]
    } catch {
      return [name, value]
    }
  }))
}

function requireProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return
  const required = [
    'DATABASE_URL', 'REDIS_URL', 'WEB_ORIGIN', 'R2_ENDPOINT',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
    'R2_PUBLIC_BASE_URL', 'ENCRYPTION_KEY_32_BYTES',
    'META_GRAPH_API_VERSION', 'META_APP_ID', 'META_APP_SECRET',
    'META_OAUTH_REDIRECT_URI', 'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET', 'PUBLIC_BASE_URL',
  ]
  const missing = required.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`Production environment is incomplete: missing ${missing.join(', ')}`)
  }
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl || (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://'))) {
    throw new Error('REDIS_URL must use redis:// or rediss:// in production')
  }
}

function applySecurityHeaders(res: any): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}

async function bootstrap() {
  requireProductionEnv()
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',').map((value) => value.trim()) ?? ['http://localhost:3000'],
    credentials: true,
  })
  app.use((req: any, res: any, next: () => void) => {
    req.cookies = parseCookies(req.headers.cookie)
    applySecurityHeaders(res)
    next()
  })
  app.useGlobalGuards(app.get(AuthGuard))
  await app.listen(process.env.PORT ?? 4000)
}
bootstrap().catch((err) => {
  console.error('[api] startup failed:', err)
  process.exit(1)
})
