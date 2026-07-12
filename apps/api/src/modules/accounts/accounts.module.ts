import { Module } from '@nestjs/common'
import { AccountsController } from './accounts.controller'
import { ConnectedAccountsService } from '../connected-accounts/connected-accounts.service'

@Module({
  controllers: [AccountsController],
  providers: [ConnectedAccountsService],
})
export class AccountsModule {}
