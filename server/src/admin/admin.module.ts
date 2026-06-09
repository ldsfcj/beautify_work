import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../entities/admin-user.entity';
import { User } from '../entities/user.entity';
import { Order } from '../entities/order.entity';
import { Generation } from '../entities/generation.entity';
import { Refund } from '../entities/refund.entity';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { PresetItem } from '../entities/preset-item.entity';
import { CreditPackage } from '../entities/credit-package.entity';
import { JwtStrategy } from '../auth/jwt.strategy';
import { CreditModule } from '../credit/credit.module';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminOrdersService } from './orders/admin-orders.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminPresetsController } from './presets/admin-presets.controller';
import { AdminPresetsService } from './presets/admin-presets.service';
import { AdminPackagesController } from './packages/admin-packages.controller';
import { AdminPackagesService } from './packages/admin-packages.service';

/**
 * Back-office (`/api/admin/*`) module. Registers:
 *   - Auth (Task 32): AdminAuthController + Service + JwtStrategy
 *   - Task 33: Dashboard / Orders / Users / Presets / Packages
 *   - Task 34: Configs / Refunds / AiLogs / AuditLogs (added in a follow-up)
 *
 * `AdminAuthGuard` is applied at the controller level (per-class
 * `@UseGuards`) rather than globally so the public login/refresh
 * routes can stay `@Public()` while everything else remains gated.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
    TypeOrmModule.forFeature([
      AdminUser,
      User,
      Order,
      Generation,
      Refund,
      AiCallLog,
      PresetItem,
      CreditPackage,
    ]),
    // Re-export the credit ledger so AdminUsersService can call
    // `recharge()` for the manual-balance-adjustment path.
    CreditModule,
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminOrdersController,
    AdminUsersController,
    AdminPresetsController,
    AdminPackagesController,
  ],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminOrdersService,
    AdminUsersService,
    AdminPresetsService,
    AdminPackagesService,
    JwtStrategy,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
