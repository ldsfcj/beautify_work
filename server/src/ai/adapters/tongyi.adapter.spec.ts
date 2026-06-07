import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TongyiAdapter } from './tongyi.adapter';

/**
 * Coverage:
 *   1. Dev path: serves the same fixture the mock uses, but
 *      tagged `wanx-v1-mock` so the AI-log view can tell "real
 *      vendor dev shortcut" from "fallback to mock adapter".
 *   2. Prod without API key: throws 503 — the AIService fallback
 *      policy in Task 23 expects this exact status to decide
 *      whether to retry / fall back.
 *   3. Prod with API key: also throws 503 today (real call
 *      deferred), but we assert the *reason* mentions the prod
 *      path so on-call engineers can grep for the deferred tag.
 */
describe('TongyiAdapter', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  function makeAdapter(envValue: string, key: string | null): TongyiAdapter {
    const cfg = {
      get: jest.fn((k: string) => {
        if (k === 'NODE_ENV') return envValue;
        if (k === 'TONGYI_API_KEY') return key;
        return undefined;
      }),
    } as unknown as ConfigService;
    return new TongyiAdapter(cfg);
  }

  it('dev path serves the fixture tagged wanx-v1-mock', async () => {
    process.env.NODE_ENV = 'development';
    const adapter = makeAdapter('development', null);

    const result = await adapter.editImage({
      imageSignedUrl: 'https://example.invalid/x.jpg',
      prompt: 'subtle rhinoplasty',
    });

    const expected = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'sample-face.jpg'),
    );
    expect(result.resultBuffer.equals(expected)).toBe(true);
    expect(result.modelUsed).toBe('wanx-v1-mock');
    expect(result.costCents).toBe(5);
  });

  it('prod path without API key throws 503', () => {
    process.env.NODE_ENV = 'production';
    const adapter = makeAdapter('production', null);

    return expect(
      adapter.editImage({ imageSignedUrl: 'x', prompt: 'y' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('prod path with API key still 503 today (real call deferred)', async () => {
    process.env.NODE_ENV = 'production';
    const adapter = makeAdapter('production', 'sk-test-fake');

    await expect(
      adapter.editImage({ imageSignedUrl: 'x', prompt: 'y' }),
    ).rejects.toThrow(/deferred/i);
  });

  it('exposes a stable adapter name', () => {
    const adapter = makeAdapter('development', null);
    expect(adapter.name).toBe('tongyi');
  });
});
