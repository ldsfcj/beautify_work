import { promises as fs } from 'fs';
import * as path from 'path';
import { MockAdapter } from './mock.adapter';

/**
 * Behaviour we own in the mock:
 *   1. Returns a non-empty Buffer sourced from the fixture.
 *   2. The Buffer's byte-length matches the fixture on disk so
 *      downstream OSS uploads can assert "we wrote the same
 *      bytes that came out of the adapter".
 *   3. `modelUsed` is the deterministic `mock-v1` tag (so the
 *      admin AI-log view can filter fallback runs).
 *   4. `costCents` is 0 — the mock must never charge the user.
 *   5. `latencyMs` is a non-negative integer.
 */
describe('MockAdapter', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('returns the fixture bytes', async () => {
    const result = await adapter.editImage({
      imageSignedUrl: 'https://example.invalid/x.jpg',
      prompt: 'subtle rhinoplasty',
    });

    const expected = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'sample-face.jpg'),
    );
    expect(result.resultBuffer.equals(expected)).toBe(true);
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
