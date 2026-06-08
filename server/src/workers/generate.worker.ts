import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { GenerateProcessor } from '../generate/generate.processor';

/**
 * Standalone worker process for the `ai.generate` queue.
 *
 *   API process     →  enqueues `ai.generate` jobs
 *   worker process  →  consumes them (this file)
 *
 * Run as:  `node dist/workers/generate.worker.js`
 * or in dev: `nest start --watch src/workers/generate.worker.ts`
 *
 * Why a separate process?
 *   - The AI vendor calls are slow (2-30s) and we don't want
 *     them eating API worker slots.
 *   - The watermark + OSS upload can spike memory; isolating
 *     them keeps the API process lean.
 *   - We can scale worker replicas independently of the API
 *     in production (Kubernetes Deployment with HPA on queue
 *     depth, Task 36).
 *
 * We boot the full AppModule so the worker has access to the
 * same DI graph (TypeORM, ConfigService, BullModule) the API
 * does. The HTTP listener is closed immediately because the
 * worker only consumes queue jobs.
 */
async function bootstrap() {
  const logger = new Logger('generate.worker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  // Force-instantiate the processor so its @Processor decorator
  // binds the Bull worker before the app goes idle.
  app.get(GenerateProcessor);

  // Bull's worker keeps the event loop alive on its own; we
  // intentionally do NOT call `app.listen()` because this
  // process has no HTTP surface.
  const shutdown = async (signal: string) => {
    logger.log(`received ${signal}, draining worker...`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.log('generate worker is consuming ai.generate jobs');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('worker bootstrap failed:', err);
  process.exit(1);
});
