import { Module } from '@nestjs/common'
import { ConnectedAccountsService } from './connected-accounts.service'
import { ConnectedAccountsController } from './connected-accounts.controller'

@Module({
  controllers: [ConnectedAccountsController],
  providers: [ConnectedAccountsService],
})
export class ConnectedAccountsModule {}
