import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common'
import { z } from 'zod'
import type { Response } from 'express'
import { AuthService } from './auth.service'

const Credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
  name: z.string().min(1).max(120).optional(),
})

const COOKIE = 'raf_session'

function cookieToken(req: any): string | undefined {
  const header = req.headers.cookie as string | undefined
  const value = header?.split(';').map((v: string) => v.trim()).find((v: string) => v.startsWith(`${COOKIE}=`))
  return value ? decodeURIComponent(value.slice(COOKIE.length + 1)) : undefined
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  })
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  async signup(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = Credentials.extend({ name: z.string().min(1).max(120) }).parse(body)
    const result = await this.auth.signup(input.email, input.password, input.name)
    setSessionCookie(res, result.token)
    return { user: result.user }
  }

  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = Credentials.parse(body)
    const result = await this.auth.login(input.email, input.password)
    setSessionCookie(res, result.token)
    return { user: result.user }
  }

  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeSession(cookieToken(req))
    res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
    return { ok: true }
  }

  @Get('me')
  async me(@Req() req: any) {
    const authorization = req.headers.authorization as string | undefined
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
    const session = await this.auth.resolveSession(bearer || cookieToken(req))
    if (!session) return { user: null }
    const user = await this.authUser(session.userId)
    return { user }
  }

  private async authUser(userId: string) {
    const { db } = await import('@reelautofly/db')
    return db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true } })
  }
}
