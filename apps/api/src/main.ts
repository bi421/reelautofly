import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { AuthGuard } from './auth/auth.guard'

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=')
    if (index < 0) return [part.trim(), '']
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]
  }))
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',').map((value) => value.trim()) ?? ['http://localhost:3000'],
    credentials: true,
  })
  app.use((req: any, _res: any, next: () => void) => {
    req.cookies = parseCookies(req.headers.cookie)
    next()
  })
  app.useGlobalGuards(app.get(AuthGuard))
  await app.listen(process.env.PORT ?? 4000)
}
bootstrap()
