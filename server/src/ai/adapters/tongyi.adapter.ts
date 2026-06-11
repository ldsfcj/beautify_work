import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AiAdapter, AiEditInput, AiEditResult } from './ai-adapter.interface';

/**
 * Adapter for the Tongyi Wanx image-editing API (Dashscope).
 *
 * Two execution paths:
 *   1. **Dev / test (`NODE_ENV !== 'production'`)** — synthesize
 *      a 1024×1024 grey placeholder JPEG in-process. We
 *      deliberately don't hit the network in dev so CI / local
 *      runs don't need a real API key and don't burn quota.
 *      (Earlier this path read a 1×1 fixture off disk — the
 *      fixture was too small for the watermark pipeline.)
 *   2. **Production** — call Dashscope's image2image endpoint with
 *      the user's signed image URL and the composed prompt, then
 *      fetch the result buffer. Wrapped in a 503 if the API key is
 *      missing so the caller (AIService, Task 23) can decide
 *      whether to fall back to the mock.
 *
 * Real Dashscope wiring is `(deferred)` — the SDK is not yet
 * installed. When the key is provisioned the only change needed
 * is the axios.post body; the public `editImage` contract stays
 * identical so AIService never has to know which path ran.
 */
@Injectable()
export class TongyiAdapter implements AiAdapter {
  readonly name = 'tongyi' as const;
  private readonly logger = new Logger(TongyiAdapter.name);
  private static readonly COST_CENTS = 5; // placeholder; reconcile against invoice
  private static readonly MODEL_ID = 'wanx-v1';
  private static readonly WIDTH = 1024;
  private static readonly HEIGHT = 1024;

  constructor(private readonly cfg: ConfigService) {}

  async editImage(input: AiEditInput): Promise<AiEditResult> {
    const start = Date.now();

    if (this.cfg.get<string>('NODE_ENV') !== 'production') {
      // Dev shortcut: synthesize a real-sized JPEG so the
      // watermark pipeline has pixels to work with.
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
        `[tongyi:dev] served ${resultBuffer.length}B synthesized ${TongyiAdapter.WIDTH}×${TongyiAdapter.HEIGHT} placeholder (${Date.now() - start}ms)`,
      );
      return {
        resultBuffer,
        modelUsed: `${TongyiAdapter.MODEL_ID}-mock`,
        costCents: TongyiAdapter.COST_CENTS,
        latencyMs: Date.now() - start,
      };
    }

    const apiKey = this.cfg.get<string>('TONGYI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'TONGYI_API_KEY not configured; cannot call Dashscope',
      );
    }

    // (deferred) Real call would live here. The shape we expect:
    //   POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis
    //   body: { model, input: { image_url, prompt }, parameters: { n: 1 } }
    //   → response.output.results[0].url → GET the URL as arraybuffer
    // Leaving as a hard 503 keeps the failure mode loud and the
    // AIService fallback path exercised in real deployments.
    this.logger.warn(
      '[tongyi:prod] real Dashscope call not yet implemented; returning 503',
    );
    throw new ServiceUnavailableException(
      'TongyiAdapter prod path is not yet implemented (deferred)',
    );
  }
}
