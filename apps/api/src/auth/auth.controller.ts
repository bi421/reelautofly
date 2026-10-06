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
    await this.auth.revokeSession(req.cookies?.[COOKIE])
    res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
    return { ok: true }
  }

  @Get('me')
  async me(@Req() req: any) {
    if (!req.userId) return { user: null }
    const user = await this.authUser(req.userId)
    return { user }
  }

  private async authUser(userId: string) {
    const { db } = await import('@reelautofly/db')
    return db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true } })
  }
}
