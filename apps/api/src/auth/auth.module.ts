import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { AuthRateLimitService } from './auth-rate-limit.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AuthRateLimitService],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
