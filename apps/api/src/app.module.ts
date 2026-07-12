import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { ConnectedAccountsModule } from './modules/connected-accounts/connected-accounts.module'
import { AccountsModule } from './modules/accounts/accounts.module'
import { UploadModule } from './modules/upload/upload.module'
import { ProductsModule } from './modules/products/products.module'
import { JobsModule } from './modules/jobs/jobs.module'

@Module({
  imports: [ConnectedAccountsModule, AccountsModule, UploadModule, ProductsModule, JobsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
