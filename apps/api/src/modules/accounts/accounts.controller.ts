import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common'
import { ConnectedAccountsService } from '../connected-accounts/connected-accounts.service'
import { ConnectAccountSchema } from '../connected-accounts/dto'
import type { AccountResponse } from '../connected-accounts/types'

@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: ConnectedAccountsService) {}

  @Post('test')
  async test(@Req() req: any, @Body() body: unknown): Promise<{ ok: boolean; message?: string; error?: string }> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return { ok: false, error: 'x-user-id header required' }
    }
    const dto = ConnectAccountSchema.parse(body)
    return { ok: true, message: `Format valid for ${dto.provider} provider` }
  }

  @Post()
  async connect(@Req() req: any, @Body() body: unknown): Promise<AccountResponse | { error: string }> {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return { error: 'x-user-id header required' }
    }
    const dto = ConnectAccountSchema.parse(body)
    return this.service.connectAccount(userId, dto)
  }
}
