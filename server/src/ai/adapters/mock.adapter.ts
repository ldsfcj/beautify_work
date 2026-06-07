import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AiAdapter, AiEditInput, AiEditResult } from './ai-adapter.interface';

/**
 * Deterministic no-op adapter used in dev / test and as the
 * fallback when the real vendor fails AND fallback is enabled in
 * `system_configs.ai_models.allowFallback` (Task 23 reads that
 * flag). The "result" is the bundled sample-face fixture — same
 * bytes every time, so tests can assert on length / checksum
 * without flake.
 *
 * `modelUsed` is set to `mock-v1` (not the real vendor model) so
 * the admin AI-logs screen can spot fallback usage at a glance.
 */
@Injectable()
export class MockAdapter implements AiAdapter {
  readonly name = 'mock' as const;
  private readonly logger = new Logger(MockAdapter.name);
  private static readonly FIXTURE = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'test',
    'fixtures',
    'sample-face.jpg',
  );
  private static readonly COST_CENTS = 0;

  async editImage(_input: AiEditInput): Promise<AiEditResult> {
    const start = Date.now();
    const resultBuffer = await fs.readFile(MockAdapter.FIXTURE);
    this.logger.debug(
      `[mock] served ${resultBuffer.length}B from fixture (${Date.now() - start}ms)`,
    );
    return {
      resultBuffer,
      modelUsed: 'mock-v1',
      costCents: MockAdapter.COST_CENTS,
      latencyMs: Date.now() - start,
    };
  }
}
