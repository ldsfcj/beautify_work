import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../entities/admin-user.entity';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';

/**
 * Back-office (`/api/admin/*`) module. Registers:
 *   - `AdminAuthController` (login / refresh / logout / me)
 *   - `AdminAuthService`   (scrypt verify + JWT sign)
 *   - `JwtStrategy`        (reused from `auth/`; validates HS256 + populates req.user)
 *   - `AdminUser`          (TypeORM repository for the `admin_users` table)
 *
 * Task 33+ adds Orders/Users/Presets/Packages controllers here; Task 34
 * adds Configs/Refunds/AiLogs/AuditLogs. The module is intentionally
 * one bucket to keep Nest's APP_GUARD wiring simple (AdminAuthGuard is
 * applied per-controller in this module rather than globally).
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
    TypeOrmModule.forFeature([AdminUser]),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, JwtStrategy],
  exports: [AdminAuthService],
})
export class AdminModule {}
