import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { AiService } from '../ai/ai.service';
import { WatermarkService } from '../ai/image-watermark';
import { releaseBurst } from '../ai/rate-limiter';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { CreditLedgerService } from '../credit/creditledger.service';
import { NotificationService } from '../notification/notification.service';
import { OssService } from '../oss/oss.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export const AI_GENERATE_QUEUE_NAME = 'ai.generate';

export interface GenerateJobData {
  generationId: string;
  userId: string;
  imageUrl: string;
  presetKeys: string[];
  text: string | null;
}

/**
 * Bull worker that consumes the `ai.generate` queue produced by
 * GenerateService.submit. The processor is intentionally dumb:
 *
 *   1. call AIService.generate (handles vendor routing + retry)
 *   2. watermark the result image
 *   3. upload to OSS
 *   4. flip the generation row to `success` + create a
 *      notification + write the AI call log
 *
 * On any thrown error we let the exception bubble so Bull's
 * built-in retry policy (`attempts: 3`, exponential backoff)
 * re-queues the job. After retries are exhausted, Bull calls
 * `failed` (see @OnWorkerEvent) and AIService has already done
 * the credit refund + status='failed' update via its own
 * `failAndRefund` path — we only need to release the burst
 * counter either way.
 */
@Injectable()
@Processor(AI_GENERATE_QUEUE_NAME, { concurrency: 4 })
export class GenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateProcessor.name);

  constructor(
    private readonly ai: AiService,
    private readonly watermark: WatermarkService,
    private readonly oss: OssService,
    private readonly ledger: CreditLedgerService,
    private readonly notif: NotificationService,
    @InjectRepository(Generation)
    private readonly gens: Repository<Generation>,
    @InjectRepository(AiCallLog)
    private readonly aiLogs: Repository<AiCallLog>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {
    super();
  }

  async process(job: Job<GenerateJobData>): Promise<void> {
    const { generationId, userId, imageUrl, presetKeys, text } = job.data;
    let aiResult;
    try {
      // The queue payload carries the OSS key (cheap to store, no
      // expiry). The AI vendor needs a real signed URL to fetch,
      // so we sign on the way out. 5-min TTL is plenty for a
      // single AI call; Bull retries re-sign each attempt.
      const imageSignedUrl = await this.oss.signedUrl(imageUrl, 300);
      aiResult = await this.ai.generate({
        generationId,
        userId,
        imageSignedUrl,
        presetKeys,
        userText: text,
      });

      const watermarked = await this.watermark.add(aiResult.resultBuffer);
      const resultUrl = await this.oss.upload(
        `gen/${generationId}.jpg`,
        watermarked,
      );

      await this.gens.update(generationId, {
        status: GenerationStatus.SUCCESS,
        resultUrl,
        modelUsed: aiResult.modelUsed,
        errorMsg: null,
      });

      await this.notif.create({
        userId,
        type: 'generation_done',
        title: '生成完成',
        body: '查看您的 AI 预览图',
        payload: { generation_id: generationId },
      });

      await this.aiLogs.save(
        this.aiLogs.create({
          userId,
          generationId,
          model: aiResult.modelUsed,
          requestSize: imageUrl.length,
          responseSize: watermarked.length,
          costCents: aiResult.costCents,
          latencyMs: aiResult.latencyMs,
          success: true,
        }),
      );

      this.logger.log(
        `[worker] generation ${generationId} → success (${aiResult.modelUsed})`,
      );
    } catch (e: any) {
      // AIService already refunded credits and flipped the row
      // to `failed` for permanent AI errors. Here we just log
      // the failure for the AI call log table and let Bull
      // re-queue (or eventually mark the job failed).
      this.logger.warn(
        `[worker] generation ${generationId} attempt ${job.attemptsMade + 1} failed: ${e?.message ?? e}`,
      );
      try {
        await this.aiLogs.save(
          this.aiLogs.create({
            userId,
            generationId,
            model: aiResult?.modelUsed ?? 'unknown',
            requestSize: imageUrl.length,
            responseSize: 0,
            costCents: 0,
            latencyMs: 0,
            success: false,
            errorCode: e?.code ?? 'WORKER_ERROR',
          }),
        );
      } catch (logErr: any) {
        this.logger.error(
          `[worker] failed to write failure log: ${logErr?.message ?? logErr}`,
        );
      }
      throw e;
    } finally {
      // Pair the burst token: must always release, even on
      // success or failure, so the next submit can claim it.
      await releaseBurst(this.redis, userId);
    }
  }

  /**
   * After all retries are exhausted, Bull marks the job
   * `failed`. We've already logged + refunded inside
   * `process()`; this hook is a no-op placeholder so a future
   * alerting integration (Task 36) can drop in cleanly.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<GenerateJobData>, err: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.error(
        `[worker] generation ${job.data.generationId} permanently failed: ${err.message}`,
      );
    }
  }
}
