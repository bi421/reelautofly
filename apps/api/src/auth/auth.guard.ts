import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { AuthService } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    if (req.method === 'OPTIONS' || req.url.startsWith('/auth/')) return true
    if (req.url === '/healthz') return true

    const authorization = req.headers.authorization as string | undefined
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
    const token = bearer || req.cookies?.raf_session
    const session = await this.auth.resolveSession(token)
    if (!session) return false
    req.userId = session.userId
    req.sessionId = session.id
    return true
  }
}
