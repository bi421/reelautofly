import { BadRequestException, Controller, Get, Post, Delete, Body, Param, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ConnectedAccountsService } from './connected-accounts.service'
import { ConnectAccountSchema } from './dto'
import type { AccountResponse, ValidateTokenResponse } from './types'

@Controller('connected-accounts')
export class ConnectedAccountsController {
  constructor(private readonly service: ConnectedAccountsService) {}

  @Get('meta/oauth/start')
  async metaOAuthStart(@Req() req: any, @Query('provider') provider?: string) {
    if (provider !== 'INSTAGRAM' && provider !== 'FACEBOOK') throw new BadRequestException('Invalid Meta provider')
    return this.service.createMetaOAuthUrl(req.userId, provider)
  }

  @Get('meta/oauth/callback')
  async metaOAuthCallback(
    @Req() req: any,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) throw new BadRequestException('Meta OAuth callback is missing code or state')
    const result = await this.service.handleMetaOAuthCallback(req.userId, code, state)
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.QROS_PUBLIC_BASE_URL || 'http://localhost:3000'
    return res.redirect(`${baseUrl.replace(/\/$/, '')}/connect?connected=${encodeURIComponent(result.provider)}`)
  }

  @Post('connect')
  async connect(@Req() req: any, @Body() body: unknown): Promise<AccountResponse> {
    const dto = ConnectAccountSchema.parse(body)
    return this.service.connectAccount(req.userId, dto)
  }

  @Get()
  async findAll(@Req() req: any): Promise<AccountResponse[]> {
    return this.service.getAccounts(req.userId)
  }

  @Delete(':id')
  async disconnect(@Req() req: any, @Param('id') accountId: string): Promise<{ success: boolean }> {
    return this.service.disconnectAccount(req.userId, accountId)
  }

  @Post(':id/validate')
  async validate(@Req() req: any, @Param('id') accountId: string): Promise<ValidateTokenResponse> {
    return this.service.validateToken(req.userId, accountId)
  }
}
