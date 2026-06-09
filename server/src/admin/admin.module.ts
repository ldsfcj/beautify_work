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
import { SystemConfig } from '../entities/system-config.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { JwtStrategy } from '../auth/jwt.strategy';
import { CreditModule } from '../credit/credit.module';
import { AuditModule } from '../audit/audit.module';
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
import { AuditService } from '../audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { AdminConfigsController } from './configs/admin-configs.controller';
import { AdminConfigsService } from './configs/admin-configs.service';
import { AdminRefundsController } from './refunds/admin-refunds.controller';
import { AdminRefundsService } from './refunds/admin-refunds.service';
import { AdminAiLogsController } from './ai-logs/admin-ai-logs.controller';
import { AdminAiLogsService } from './ai-logs/admin-ai-logs.service';

/**
 * Back-office (`/api/admin/*`) module. Registers:
 *   - Auth (Task 32): AdminAuthController + Service + JwtStrategy
 *   - Task 33: Dashboard / Orders / Users / Presets / Packages
 *   - Task 34: Audit + Configs / Refunds / AiLogs
 *
 * `AuditService` is the single write-side audit fan-out; it is
 * injected into AdminAuthService (login), AdminUsersService
 * (credit adjust), AdminPresetsService (CRUD), AdminPackagesService
 * (CRUD), AdminConfigsService (upsert), AdminRefundsService
 * (approve/reject).
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
      SystemConfig,
      AuditLog,
    ]),
    CreditModule,
    AuditModule,
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminOrdersController,
    AdminUsersController,
    AdminPresetsController,
    AdminPackagesController,
    AdminConfigsController,
    AdminRefundsController,
    AdminAiLogsController,
    AuditController,
  ],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminOrdersService,
    AdminUsersService,
    AdminPresetsService,
    AdminPackagesService,
    AdminConfigsService,
    AdminRefundsService,
    AdminAiLogsService,
    AuditService,
    JwtStrategy,
  ],
  exports: [AdminAuthService, AuditService],
})
export class AdminModule {}
