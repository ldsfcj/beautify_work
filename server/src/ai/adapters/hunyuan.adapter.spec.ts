import { HttpException, HttpStatus } from '@nestjs/common';
import { HunyuanAdapter } from './hunyuan.adapter';

/**
 * The stub is intentionally trivial: every call must throw 501 so
 * AIService's fallback logic (Task 23) treats it as a real-but-
 * unimplemented vendor instead of swallowing the failure.
 */
describe('HunyuanAdapter', () => {
  let adapter: HunyuanAdapter;

  beforeEach(() => {
    adapter = new HunyuanAdapter();
  });

  it('exposes the hunyuan name', () => {
    expect(adapter.name).toBe('hunyuan');
  });

  it('always throws 501 NOT_IMPLEMENTED', async () => {
    let caught: unknown;
    try {
      await adapter.editImage({ imageSignedUrl: 'x', prompt: 'y' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
  });
});
