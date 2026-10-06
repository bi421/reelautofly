import { Controller, Post, Body, Req } from '@nestjs/common'
import { ConnectedAccountsService } from '../connected-accounts/connected-accounts.service'
import { ConnectAccountSchema } from '../connected-accounts/dto'
import type { AccountResponse } from '../connected-accounts/types'

@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: ConnectedAccountsService) {}

  @Post('test')
  async test(@Req() req: any, @Body() body: unknown): Promise<{ ok: boolean; message?: string; error?: string }> {
    const dto = ConnectAccountSchema.parse(body)
    return { ok: true, message: `Format valid for ${dto.provider} provider` }
  }

  @Post()
  async connect(@Req() req: any, @Body() body: unknown): Promise<AccountResponse> {
    const dto = ConnectAccountSchema.parse(body)
    return this.service.connectAccount(req.userId, dto)
  }
}
