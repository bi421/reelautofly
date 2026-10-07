import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'

function sessionCookie(req: any): string | undefined {
  const parsed = req.cookies?.raf_session
  if (typeof parsed === 'string') return parsed
  const header = req.headers.cookie as string | undefined
  const value = header?.split(';').map((v: string) => v.trim()).find((v: string) => v.startsWith('raf_session='))
  if (!value) return undefined
  try {
    return decodeURIComponent(value.slice('raf_session='.length))
  } catch {
    return undefined
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    if (req.method === 'OPTIONS' || req.url.startsWith('/auth/') || req.url === '/healthz' || req.url === '/readyz' || req.url === '/billing/webhook') return true

    const authorization = req.headers.authorization as string | undefined
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
    const session = await this.auth.resolveSession(bearer || sessionCookie(req))
    if (!session) throw new UnauthorizedException('Authentication required')
    req.userId = session.userId
    req.sessionId = session.id
    return true
  }
}
