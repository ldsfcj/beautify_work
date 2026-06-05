import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
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
