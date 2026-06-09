import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { dataSourceOptions } from './config/typeorm.config';
import { validateEnv } from './config/validation';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { RedisModule } from './redis/redis.module';
import { SmsModule } from './sms/sms.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { UserModule } from './user/user.module';
import { AgreementModule } from './agreement/agreement.module';
import { CreditModule } from './credit/credit.module';
import { CreditPackageModule } from './credit-package/credit-package.module';
import { PaymentModule } from './payment/payment.module';
import { OrderModule } from './order/order.module';
import { CronModule } from './cron/cron.module';
import { PresetModule } from './preset/preset.module';
import { AiModule } from './ai/ai.module';
import { NotificationModule } from './notification/notification.module';
import { GenerateModule } from './generate/generate.module';
import { OssModule } from './oss/oss.module';
import { AdminModule } from './admin/admin.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule as CfgMod } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...dataSourceOptions,
        url: config.get<string>('database.url'),
        autoLoadEntities: false,
        // Migrations are run explicitly via the typeorm CLI in development;
        // Nest only applies pending migrations on app boot in production.
        migrationsRun: process.env.NODE_ENV === 'production',
      }),
    }),
    RedisModule,
    CryptoModule,
    SmsModule,
    AuthModule,
    UserModule,
    AgreementModule,
    CreditModule,
    CreditPackageModule,
    PaymentModule,
    OrderModule,
    CronModule,
    PresetModule,
    AiModule,
    NotificationModule,
    OssModule,
    AdminModule,
    BullModule.forRootAsync({
      imports: [CfgMod],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url'),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    GenerateModule,
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
          transport:
            process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    TerminusModule,
  ],
  controllers: [AppController],
  providers: [
    // Authentication is the default; @Public() opts out.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // RBAC: only fires on routes carrying @Roles(...).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
