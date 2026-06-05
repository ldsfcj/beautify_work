import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.enableCors({
    origin: [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean) as string[],
    credentials: true,
  });

  // Mount a text body parser for Wechat's XML notify (the default
  // JSON / urlencoded parsers Nest installs do not handle text/xml).
  // The route handler (PaymentController.wechatNotify) reads req.body
  // as a raw string for signature verification.
  app.use(
    '/api/payment/wechat/notify',
    express.text({ type: ['text/xml', 'application/xml'] }),
  );

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('医美咨询 H5 API')
      .setVersion('2.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  app.get(Logger).log(`🚀 Server running on http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
