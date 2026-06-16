import {
  BadRequestException,
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';
import { AiAdapter, AiEditInput, AiEditResult } from './ai-adapter.interface';

/**
 * Adapter for the Tongyi Wanx image-editing API (Dashscope).
 *
 * Two execution paths:
 *   1. **No API key** — synthesize a 1024×1024 grey placeholder JPEG
 *      in-process. This keeps CI / local dev without a key working
 *      and avoids burning quota on accidental calls.
 *   2. **API key present** — call Dashscope's async image2image
 *      endpoint (submit → poll → download result), regardless of
 *      NODE_ENV. This lets developers test the real API locally.
 *
 * Dashscope async flow:
 *   POST /services/aigc/image2image/image-synthesis → task_id
 *   GET  /tasks/{task_id}                           → poll until SUCCEEDED
 *   GET  result URL                                  → download as Buffer
 */
@Injectable()
export class TongyiAdapter implements AiAdapter {
  readonly name = 'tongyi' as const;
  private readonly logger = new Logger(TongyiAdapter.name);

  private static readonly MODEL_ID = 'wanx2.1-img2img';
  private static readonly COST_CENTS = 4; // 0.04 CNY = 4 cents
  private static readonly BASE_URL =
    'https://dashscope.aliyuncs.com/api/v1';
  private static readonly POLL_INTERVAL_MS = 2000;
  private static readonly POLL_MAX_ATTEMPTS = 30; // 60s total
  private static readonly DEFAULT_STRENGTH = 0.55;
  private static readonly WIDTH = 1024;
  private static readonly HEIGHT = 1024;

  constructor(
    private readonly cfg: ConfigService,
    private readonly http: HttpService,
  ) {}

  async editImage(input: AiEditInput): Promise<AiEditResult> {
    const start = Date.now();
    const apiKey = this.cfg.get<string>('TONGYI_API_KEY');

    // No key → local synthesis (CI-safe, quota-safe)
    if (!apiKey) {
      return this.synthesizePlaceholder(start);
    }

    // Key present → real Dashscope call
    const taskId = await this.submitTask(apiKey, input);
    this.logger.log(`[tongyi] submit task ${taskId}, polling...`);

    const resultUrl = await this.pollUntilDone(apiKey, taskId);
    const resultBuffer = await this.downloadResult(resultUrl);

    const latency = Date.now() - start;
    this.logger.log(
      `[tongyi] result received (${latency}ms, ${resultBuffer.length}B)`,
    );

    return {
      resultBuffer,
      modelUsed: TongyiAdapter.MODEL_ID,
      costCents: TongyiAdapter.COST_CENTS,
      latencyMs: latency,
    };
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Submit an async image2image task to Dashscope.
   * Returns the task_id for subsequent polling.
   */
  private async submitTask(
    apiKey: string,
    input: AiEditInput,
  ): Promise<string> {
    const url = `${TongyiAdapter.BASE_URL}/services/aigc/image2image/image-synthesis`;

    try {
      const { data, status } = await firstValueFrom(
        this.http.post(
          url,
          {
            model: TongyiAdapter.MODEL_ID,
            input: {
              image_url: input.imageSignedUrl,
              prompt: input.prompt,
            },
            parameters: {
              n: 1,
              size: `${TongyiAdapter.WIDTH}*${TongyiAdapter.HEIGHT}`,
              strength: TongyiAdapter.DEFAULT_STRENGTH,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'X-DashScope-Async': 'enable',
            },
            validateStatus: () => true, // don't throw on non-2xx
          },
        ),
      );

      if (status === 400 || (status >= 400 && status < 500 && status !== 429)) {
        // 4xx (not 429): bad request — retrying won't help
        const msg = data?.message || data?.output?.message || JSON.stringify(data);
        this.logger.warn(`[tongyi] submit 4xx (status=${status}): ${msg}`);
        throw new BadRequestException(
          `Dashscope submit failed: ${msg}`,
        );
      }

      if (status === 429) {
        // Rate limited — let AIService retry
        this.logger.warn(`[tongyi] submit 429 (rate limited)`);
        throw new BadGatewayException('Dashscope rate limited');
      }

      if (status >= 500) {
        // Server error — retryable
        this.logger.warn(`[tongyi] submit 5xx (status=${status})`);
        throw new BadGatewayException(
          `Dashscope server error (status=${status})`,
        );
      }

      const taskId = data?.output?.task_id;
      if (!taskId) {
        this.logger.error(
          `[tongyi] unexpected submit response: ${JSON.stringify(data)}`,
        );
        throw new BadGatewayException(
          'Dashscope returned no task_id',
        );
      }

      return taskId;
    } catch (e: any) {
      // Re-throw our own exceptions
      if (
        e instanceof BadRequestException ||
        e instanceof BadGatewayException
      ) {
        throw e;
      }
      // Network / timeout errors
      this.logger.warn(`[tongyi] submit network error: ${e.message}`);
      throw new BadGatewayException(
        `Dashscope network error: ${e.message}`,
      );
    }
  }

  /**
   * Poll the Dashscope task endpoint until SUCCEEDED or FAILED.
   * Polls every POLL_INTERVAL_MS, up to POLL_MAX_ATTEMPTS.
   */
  private async pollUntilDone(
    apiKey: string,
    taskId: string,
  ): Promise<string> {
    const url = `${TongyiAdapter.BASE_URL}/tasks/${taskId}`;

    for (let attempt = 1; attempt <= TongyiAdapter.POLL_MAX_ATTEMPTS; attempt++) {
      // Wait before polling (skip on first attempt — Dashscope needs a moment)
      if (attempt > 1) {
        await this.sleep(TongyiAdapter.POLL_INTERVAL_MS);
      }

      try {
        const { data } = await firstValueFrom(
          this.http.get(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
            validateStatus: () => true,
          }),
        );

        const taskStatus = data?.output?.task_status;

        if (taskStatus === 'SUCCEEDED') {
          const resultUrl: string | undefined =
            data?.output?.results?.[0]?.url;
          if (!resultUrl) {
            this.logger.error(
              `[tongyi] task SUCCEEDED but no result URL: ${JSON.stringify(data)}`,
            );
            throw new BadGatewayException(
              'Dashscope task succeeded but no result URL',
            );
          }
          return resultUrl;
        }

        if (taskStatus === 'FAILED') {
          const msg =
            data?.output?.message || data?.message || 'unknown error';
          this.logger.warn(`[tongyi] task FAILED: ${msg}`);
          throw new BadGatewayException(
            `Dashscope task failed: ${msg}`,
          );
        }

        // PENDING / RUNNING — continue polling
        this.logger.debug(
          `[tongyi] poll attempt ${attempt}/${TongyiAdapter.POLL_MAX_ATTEMPTS}: ${taskStatus}`,
        );
      } catch (e: any) {
        // Re-throw our own exceptions (FAILED, no URL)
        if (e instanceof BadGatewayException) throw e;
        // Network errors during polling — continue trying
        this.logger.warn(
          `[tongyi] poll network error (attempt ${attempt}): ${e.message}`,
        );
      }
    }

    // Exhausted all attempts
    this.logger.warn(
      `[tongyi] poll timeout after ${TongyiAdapter.POLL_MAX_ATTEMPTS} attempts`,
    );
    throw new GatewayTimeoutException(
      `Dashscope task timed out after ${TongyiAdapter.POLL_MAX_ATTEMPTS * TongyiAdapter.POLL_INTERVAL_MS / 1000}s`,
    );
  }

  /**
   * Download the result image from the Dashscope result URL.
   */
  private async downloadResult(resultUrl: string): Promise<Buffer> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(resultUrl, {
          responseType: 'arraybuffer',
        }),
      );
      return Buffer.from(data);
    } catch (e: any) {
      this.logger.warn(
        `[tongyi] download result failed: ${e.message}`,
      );
      throw new BadGatewayException(
        `Failed to download Dashscope result: ${e.message}`,
      );
    }
  }

  /**
   * Synthesize a grey placeholder JPEG when no API key is configured.
   * This keeps CI / keyless dev working and the watermark pipeline
   * has enough pixels to process.
   */
  private async synthesizePlaceholder(start: number): Promise<AiEditResult> {
    const resultBuffer = await sharp({
      create: {
        width: TongyiAdapter.WIDTH,
        height: TongyiAdapter.HEIGHT,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    this.logger.debug(
      `[tongyi:no-key] served ${resultBuffer.length}B synthesized ` +
        `${TongyiAdapter.WIDTH}×${TongyiAdapter.HEIGHT} placeholder ` +
        `(${Date.now() - start}ms)`,
    );

    return {
      resultBuffer,
      modelUsed: `${TongyiAdapter.MODEL_ID}-mock`,
      costCents: 5, // legacy placeholder cost
      latencyMs: Date.now() - start,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
