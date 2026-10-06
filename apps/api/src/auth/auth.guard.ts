import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    if (req.method === 'OPTIONS' || req.url.startsWith('/auth/') || req.url === '/healthz' || req.url === '/readyz' || req.url === '/billing/webhook') return true

    const authorization = req.headers.authorization as string | undefined
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
    const cookieHeader = req.headers.cookie as string | undefined
    const cookie = cookieHeader?.split(';').map((v: string) => v.trim()).find((v: string) => v.startsWith('raf_session='))
    const sessionToken = cookie ? decodeURIComponent(cookie.slice('raf_session='.length)) : undefined
    const session = await this.auth.resolveSession(bearer || sessionToken)
    if (!session) throw new UnauthorizedException('Authentication required')
    req.userId = session.userId
    req.sessionId = session.id
    return true
  }
}
