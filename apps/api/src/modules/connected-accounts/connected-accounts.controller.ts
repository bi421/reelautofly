import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common'
import { ConnectedAccountsService } from './connected-accounts.service'
import { ConnectAccountSchema } from './dto'
import type { AccountResponse, ValidateTokenResponse } from './types'

@Controller('connected-accounts')
export class ConnectedAccountsController {
  constructor(private readonly service: ConnectedAccountsService) {}

  @Post('connect')
  async connect(@Req() req: any, @Body() body: unknown): Promise<AccountResponse> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      throw new Error('x-user-id header required')
    }
    const dto = ConnectAccountSchema.parse(body)
    return this.service.connectAccount(userId, dto)
  }

  @Get()
  async findAll(@Req() req: any): Promise<AccountResponse[]> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      throw new Error('x-user-id header required')
    }
    return this.service.getAccounts(userId)
  }

  @Delete(':id')
  async disconnect(@Req() req: any, @Param('id') accountId: string): Promise<{ success: boolean }> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      throw new Error('x-user-id header required')
    }
    return this.service.disconnectAccount(userId, accountId)
  }

  @Post(':id/validate')
  async validate(@Param('id') accountId: string): Promise<ValidateTokenResponse> {
    return this.service.validateToken(accountId)
  }
}
