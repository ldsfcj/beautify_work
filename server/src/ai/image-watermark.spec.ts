import sharp from 'sharp';
import { WatermarkService } from './image-watermark';

/**
 * The watermark is a pure image transform — no DB, no network.
 * Tests use sharp to generate a synthetic input and assert that
 * the output (a) is valid JPEG, (b) is the same dimensions as
 * the input, and (c) is meaningfully larger than the SVG overlay
 * alone would be (i.e. the original image bytes survived).
 */
describe('WatermarkService', () => {
  let service: WatermarkService;

  beforeEach(() => {
    service = new WatermarkService();
  });

  async function makeImage(w: number, h: number): Promise<Buffer> {
    return sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  it('returns a valid JPEG with the same dimensions as the input', async () => {
    const input = await makeImage(800, 600);
    const out = await service.add(input);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('preserves the input bytes (output is not just the SVG overlay)', async () => {
    const input = await makeImage(1024, 1024);
    const out = await service.add(input);
    // The SVG overlay alone is ~600 bytes; the input JPEG is
    // ~5 KB. The composited output should be at least the size
    // of the input (rounded up by the overlay). If we get back
    // something tiny, the composite dropped the image.
    expect(out.length).toBeGreaterThan(input.length * 0.5);
  });

  it('handles non-square images (landscape and portrait)', async () => {
    const landscape = await makeImage(1920, 1080);
    const portrait = await makeImage(720, 1280);
    const outL = await service.add(landscape);
    const outP = await service.add(portrait);
    expect((await sharp(outL).metadata()).width).toBe(1920);
    expect((await sharp(outP).metadata()).width).toBe(720);
  });
});
