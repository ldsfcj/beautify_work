import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { dataSourceOptions } from './config/typeorm.config';
import { validateEnv } from './config/validation';
import { AppController } from './app.controller';

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
})
export class AppModule {}
