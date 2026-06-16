import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';
import { AiAdapter, AiEditInput, AiEditResult } from './ai-adapter.interface';

/**
 * Adapter for the Tongyi (DashScope) multimodal image-editing API.
 *
 * `wan2.7-image` and `qwen-image-edit*` live on the `multimodal-generation`
 * endpoint (synchronous), not the legacy `image2image/image-synthesis`
 * async submit→poll endpoint. The request body uses OpenAI-style
 * `messages: [{ role, content: [{image}, {text}] }]`, and the response
 * returns the generated image URL inline in `output.choices[0].message
 * .content[0].image` — no task_id, no polling.
 *
 * Two execution paths:
 *   1. **No API key** — synthesize a 1024×1024 grey placeholder JPEG
 *      in-process. CI-safe / quota-safe.
 *   2. **API key present** — call DashScope `multimodal-generation`,
 *      download the returned image URL, return as Buffer.
 *
 * Reference:
 *   POST /api/v1/services/aigc/multimodal-generation/generation
 *   200 response:
 *     { output: { choices: [{ finish_reason, message: { role, content: [
 *         { image: 'https://...' } | { text: '...' }
 *       ]}}]}, usage: { ... } }
 */
@Injectable()
export class TongyiAdapter implements AiAdapter {
  readonly name = 'tongyi' as const;
  private readonly logger = new Logger(TongyiAdapter.name);

  private static readonly MODEL_ID = 'wan2.7-image';
  private static readonly COST_CENTS = 4; // 0.04 CNY = 4 cents
  private static readonly BASE_URL =
    'https://dashscope.aliyuncs.com/api/v1';
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

    // Log the request shape so a single grep through worker.log
    // answers "what prompt + image did we send to DashScope for
    // generation <id>?" — the modelUsed / image URL / prompt are
    // the three things you need to reproduce a bad result.
    this.logRequest(input);

    // Key present → real DashScope call (sync multimodal-generation)
    const resultUrl = await this.callMultimodal(apiKey, input);
    this.logger.log(
      `[tongyi] multimodal call model=${TongyiAdapter.MODEL_ID} → result ${resultUrl.slice(0, 80)}…`,
    );
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

  /**
   * Emit one structured log line per DashScope call. Includes the
   * model, prompt (full text — the failure-mode you usually want
   * to reproduce is "what was the model actually asked to do?"),
   * and the input image URL with its signature query string
   * stripped (so the signed URL doesn't leak into long-lived log
   * files / external aggregators).
   */
  private logRequest(input: AiEditInput): void {
    let safeImage = input.imageSignedUrl;
    try {
      const u = new URL(input.imageSignedUrl);
      // Drop ?Expires=…&Signature=…&OSSAccessKeyId=… — only the
      // host + path is interesting for debugging.
      safeImage = `${u.host}${u.pathname}`;
    } catch {
      // not a parseable URL (shouldn't happen) — log as-is, masked
      safeImage = '<unparseable imageSignedUrl>';
    }
    this.logger.log(
      `[tongyi] request model=${TongyiAdapter.MODEL_ID} ` +
        `image=${safeImage} ` +
        `prompt=${JSON.stringify(input.prompt)}`,
    );
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * POST to the multimodal-generation endpoint. Returns the URL of
   * the generated image extracted from the sync response.
   */
  private async callMultimodal(
    apiKey: string,
    input: AiEditInput,
  ): Promise<string> {
    const url = `${TongyiAdapter.BASE_URL}/services/aigc/multimodal-generation/generation`;

    try {
      const { data, status } = await firstValueFrom(
        this.http.post(
          url,
          {
            model: TongyiAdapter.MODEL_ID,
            input: {
              messages: [
                {
                  role: 'user',
                  content: [
                    { image: input.imageSignedUrl },
                    { text: input.prompt },
                  ],
                },
              ],
            },
            parameters: {
              n: 1,
              size: `${TongyiAdapter.WIDTH}*${TongyiAdapter.HEIGHT}`,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            validateStatus: () => true, // don't throw on non-2xx
          },
        ),
      );

      if (status === 400 || (status >= 400 && status < 500 && status !== 429)) {
        const msg = data?.message || data?.output?.message || JSON.stringify(data);
        this.logger.warn(`[tongyi] multimodal 4xx (status=${status}): ${msg}`);
        throw new BadRequestException(`DashScope multimodal failed: ${msg}`);
      }

      if (status === 429) {
        this.logger.warn(`[tongyi] multimodal 429 (rate limited)`);
        throw new BadGatewayException('DashScope rate limited');
      }

      if (status >= 500) {
        this.logger.warn(`[tongyi] multimodal 5xx (status=${status})`);
        throw new BadGatewayException(
          `DashScope server error (status=${status})`,
        );
      }

      // Walk the OpenAI-style content array and find the first image part.
      const content = data?.output?.choices?.[0]?.message?.content;
      if (!Array.isArray(content)) {
        this.logger.error(
          `[tongyi] unexpected multimodal response (no content array): ${JSON.stringify(data).slice(0, 500)}`,
        );
        throw new BadGatewayException('DashScope returned no content array');
      }
      const imagePart = content.find(
        (c: any) => typeof c === 'object' && c && typeof c.image === 'string',
      );
      if (!imagePart?.image) {
        this.logger.error(
          `[tongyi] no image in multimodal content: ${JSON.stringify(content).slice(0, 500)}`,
        );
        throw new BadGatewayException(
          'DashScope multimodal response had no image part',
        );
      }
      return imagePart.image;
    } catch (e: any) {
      if (
        e instanceof BadRequestException ||
        e instanceof BadGatewayException
      ) {
        throw e;
      }
      this.logger.warn(`[tongyi] multimodal network error: ${e.message}`);
      throw new BadGatewayException(
        `DashScope network error: ${e.message}`,
      );
    }
  }

  /**
   * Download the result image from the URL DashScope returned.
   * The result URL is hosted on `dashscope-result-bj.aliyuncs.com` or
   * similar and is short-lived (~24h), so we download immediately
   * and never re-use it.
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
      this.logger.warn(`[tongyi] download result failed: ${e.message}`);
      throw new BadGatewayException(
        `Failed to download DashScope result: ${e.message}`,
      );
    }
  }

  /**
   * Synthesize a grey placeholder JPEG when no API key is configured.
   * Keeps CI / keyless dev working and the watermark pipeline has
   * enough pixels to process.
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
}
