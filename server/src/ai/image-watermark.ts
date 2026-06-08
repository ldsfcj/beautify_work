import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Watermark the AI-generated preview image with the two
 * non-removable compliance overlays required by the medical
 * aesthetics D6/D7 design decisions:
 *
 *   1. Bottom-left "AI 模拟预览..." disclaimer text in
 *      semi-transparent white with a faint dark stroke so it
 *      reads on both light and dark backgrounds.
 *   2. Bottom-right pink "AI 生成" badge, matching the brand
 *      palette (212,165,160) so the badge is recognisable
 *      without screaming.
 *
 * Output is JPEG @ quality 90 to keep OSS storage + downlink
 * cost reasonable (typical 1024x1024 result lands at ~150 KB).
 *
 * The watermark is composited as a single SVG layer so the
 * original image bytes are not re-encoded twice; `sharp`
 * handles the SVG → PNG rasterise internally and only encodes
 * JPEG once at the end.
 */
@Injectable()
export class WatermarkService {
  /**
   * Apply the compliance watermark to `buf` and return the
   * encoded JPEG bytes ready for OSS upload.
   */
  async add(buf: Buffer): Promise<Buffer> {
    const img = sharp(buf);
    const meta = await img.metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 1024;

    // SVG layer: text scales with image height so a 512x512
    // thumbnail gets a smaller badge than a 2048x2048 full res.
    const fontSize = Math.max(14, Math.round(height * 0.022));
    const badgeWidth = Math.round(width * 0.18);
    const badgeHeight = Math.round(height * 0.06);
    const badgeX = width - badgeWidth - Math.round(width * 0.03);
    const badgeY = height - badgeHeight - Math.round(height * 0.04);
    const textX = Math.round(width * 0.03);
    const textY = height - Math.round(height * 0.03);

    const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${textX}" y="${textY}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="${fontSize}" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.45)" stroke-width="0.6" paint-order="stroke">AI 模拟预览，仅供娱乐参考，不构成医疗建议</text>
      <rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="${Math.round(badgeHeight * 0.18)}" fill="rgba(212,165,160,0.92)"/>
      <text x="${badgeX + badgeWidth / 2}" y="${badgeY + badgeHeight * 0.7}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="${Math.round(fontSize * 0.95)}" fill="white" text-anchor="middle" font-weight="600">AI 生成</text>
    </svg>`);

    return img
      .composite([{ input: svg, top: 0, left: 0 }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }
}
