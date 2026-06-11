import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { AiAdapter, AiEditInput, AiEditResult } from './ai-adapter.interface';

/**
 * Deterministic no-op adapter used in dev / test and as the
 * fallback when the real vendor fails AND fallback is enabled in
 * `system_configs.ai_models.allowFallback` (Task 23 reads that
 * flag). The "result" is a synthesized 1024×1024 grey JPEG —
 * same dimensions every time, so tests can assert on length /
 * metadata without flake, and the watermark pipeline has enough
 * pixels to host a real SVG composite (a 1×1 placeholder made
 * the badge collapse to 0×0 and libjpeg reject the output).
 *
 * `modelUsed` is set to `mock-v1` (not the real vendor model) so
 * the admin AI-logs screen can spot fallback usage at a glance.
 */
@Injectable()
export class MockAdapter implements AiAdapter {
  readonly name = 'mock' as const;
  private readonly logger = new Logger(MockAdapter.name);
  private static readonly COST_CENTS = 0;
  private static readonly WIDTH = 1024;
  private static readonly HEIGHT = 1024;

  async editImage(_input: AiEditInput): Promise<AiEditResult> {
    const start = Date.now();
    const resultBuffer = await sharp({
      create: {
        width: MockAdapter.WIDTH,
        height: MockAdapter.HEIGHT,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
    this.logger.debug(
      `[mock] served ${resultBuffer.length}B synthesized ${MockAdapter.WIDTH}×${MockAdapter.HEIGHT} placeholder (${Date.now() - start}ms)`,
    );
    return {
      resultBuffer,
      modelUsed: 'mock-v1',
      costCents: MockAdapter.COST_CENTS,
      latencyMs: Date.now() - start,
    };
  }
}
