import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { ConnectedAccountsModule } from './modules/connected-accounts/connected-accounts.module'
import { AccountsModule } from './modules/accounts/accounts.module'
import { UploadModule } from './modules/upload/upload.module'
import { ProductsModule } from './modules/products/products.module'
import { JobsModule } from './modules/jobs/jobs.module'
import { AuthModule } from './auth/auth.module'
import { HealthController } from './health.controller'
import { BillingModule } from './modules/billing/billing.module'

@Module({
  imports: [AuthModule, BillingModule, ConnectedAccountsModule, AccountsModule, UploadModule, ProductsModule, JobsModule],
  controllers: [AppController, HealthController],
  providers: [],
})
export class AppModule {}
