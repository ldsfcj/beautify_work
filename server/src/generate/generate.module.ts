import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditModule } from '../credit/credit.module';
import { AiModule } from '../ai/ai.module';
import { NotificationModule } from '../notification/notification.module';
import { OssModule } from '../oss/oss.module';
import { Generation } from '../entities/generation.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { DownloadLog } from '../entities/download-log.entity';
import { GenerateController } from './generate.controller';
import {
  AI_GENERATE_QUEUE,
  GenerateService,
} from './generate.service';
import { AI_GENERATE_QUEUE_NAME, GenerateProcessor } from './generate.processor';
import { WatermarkService } from '../ai/image-watermark';

/**
 * Generate module — wires the submit hot path (controller +
 * service) and the worker processor onto a single Bull queue.
 *
 * Note on module shape:
 *   - `GenerateProcessor` is registered as a provider here, but
 *     it only actually processes jobs when run inside the
 *     dedicated worker process (see src/workers/generate.worker.ts).
 *     In the API process it sits idle but still has its
 *     `@Processor` decorator bound, which is fine.
 *   - `OssService` is imported via `OssModule` (single instance
 *     shared with OssController and any other consumer).
 *     `WatermarkService` is self-contained (no deps) so it
 *     lives as a local provider.
 *   - Both are exported so future admin endpoints (Task 34 —
 *     back-office image inspector) can reach them without an
 *     import cycle.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Generation, SystemConfig, AiCallLog, DownloadLog]),
    BullModule.registerQueue({ name: AI_GENERATE_QUEUE_NAME }),
    CreditModule,
    AiModule,
    NotificationModule,
    OssModule,
  ],
  controllers: [GenerateController],
  providers: [
    GenerateService,
    GenerateProcessor,
    WatermarkService,
    {
      // The service uses `@Inject(AI_GENERATE_QUEUE)` to grab
      // the Bull Queue. We re-export the same token here so
      // the spec's `useValue` mock works.
      provide: AI_GENERATE_QUEUE,
      useExisting: `BullQueue_${AI_GENERATE_QUEUE_NAME}`,
    },
  ],
  exports: [GenerateService, GenerateProcessor, WatermarkService],
})
export class GenerateModule {}
