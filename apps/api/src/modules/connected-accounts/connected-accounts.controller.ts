import { Controller, Get, Post, Delete, Body, Param, Req } from '@nestjs/common'
import { ConnectedAccountsService } from './connected-accounts.service'
import { ConnectAccountSchema } from './dto'
import type { AccountResponse, ValidateTokenResponse } from './types'

@Controller('connected-accounts')
export class ConnectedAccountsController {
  constructor(private readonly service: ConnectedAccountsService) {}

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
