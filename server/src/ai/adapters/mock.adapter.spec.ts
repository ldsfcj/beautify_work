import sharp from 'sharp';
import { MockAdapter } from './mock.adapter';

/**
 * Behaviour we own in the mock:
 *   1. Returns a non-empty Buffer that is a valid JPEG large
 *      enough for the downstream watermark pipeline (≥512×512
 *      — a 1×1 placeholder broke the SVG composite in prod).
 *   2. `modelUsed` is the deterministic `mock-v1` tag (so the
 *      admin AI-log view can filter fallback runs).
 *   3. `costCents` is 0 — the mock must never charge the user.
 *   4. `latencyMs` is a non-negative integer.
 */
describe('MockAdapter', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('returns a real-sized valid JPEG that the watermark pipeline can process', async () => {
    const result = await adapter.editImage({
      imageSignedUrl: 'https://example.invalid/x.jpg',
      prompt: 'subtle rhinoplasty',
    });

    const meta = await sharp(result.resultBuffer).metadata();
    expect(meta.format).toBe('jpeg');
    // The watermark composes an SVG badge; if the buffer is
    // smaller than 512×512 the badge collapses to <1px and
    // libjpeg rejects the output ("1 extraneous bytes before
    // marker 0xda"). See generate.processor.onFailed for the
    // user-visible failure mode.
    expect(meta.width).toBeGreaterThanOrEqual(512);
    expect(meta.height).toBeGreaterThanOrEqual(512);
  });

  it('exposes a stable adapter name', () => {
    expect(adapter.name).toBe('mock');
  });

  it('reports the mock model id, not a real vendor', () => {
    return adapter
      .editImage({ imageSignedUrl: 'x', prompt: 'y' })
      .then((r) => expect(r.modelUsed).toBe('mock-v1'));
  });

  it('charges zero cents (mock must never debit the user)', async () => {
    const r = await adapter.editImage({ imageSignedUrl: 'x', prompt: 'y' });
    expect(r.costCents).toBe(0);
  });

  it('reports a non-negative integer latency', async () => {
    const r = await adapter.editImage({ imageSignedUrl: 'x', prompt: 'y' });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(r.latencyMs)).toBe(true);
  });
});
