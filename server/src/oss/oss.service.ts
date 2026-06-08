import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Thin wrapper over ali-oss with a local-FS dev fallback.
 *
 * The dev fallback matters: in sandboxed environments (and on
 * the consultant's laptop before any real AK/SK is provisioned)
 * the worker can still execute end-to-end. The local files
 * land under `./.oss-dev/` so they're easy to inspect and
 * `.gitignore`-able.
 *
 * The real ali-oss path is used whenever `OSS_ACCESS_KEY_ID`
 * is set in env. We never fall back silently — callers get a
 * clearly distinguishable URL (the local file URL) so any test
 * result can be traced back to which path was used.
 */
@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);
  private readonly client: OSS | null;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly devDir: string;

  constructor(cfg: ConfigService) {
    const ak = cfg.get<string>('oss.accessKeyId');
    const sk = cfg.get<string>('oss.accessKeySecret');
    this.bucket = cfg.get<string>('oss.bucket') ?? 'beautify-dev';
    this.endpoint = cfg.get<string>('oss.endpoint') ?? '';
    this.devDir = path.resolve(process.cwd(), '.oss-dev');

    if (ak && sk) {
      this.client = new OSS({
        accessKeyId: ak,
        accessKeySecret: sk,
        bucket: this.bucket,
        endpoint: this.endpoint || undefined,
        secure: true,
      });
      this.logger.log(`[oss] using Aliyun OSS bucket=${this.bucket}`);
    } else {
      this.client = null;
      this.logger.warn(
        `[oss] OSS_ACCESS_KEY_ID not set; uploads will be written to ${this.devDir}`,
      );
    }
  }

  /**
   * Upload a buffer and return the public-ish URL the worker
   * (and later the download-url endpoint, Task 26) can use.
   *
   *   - real OSS → `https://<bucket>.<endpoint>/<key>`
   *   - dev FS   → `file://<abs path>`
   */
  async upload(key: string, buf: Buffer, _contentType = 'image/jpeg'): Promise<string> {
    if (this.client) {
      const result = await this.client.put(key, buf, {
        headers: { 'Content-Type': _contentType },
      });
      this.logger.log(`[oss] uploaded ${key} (${buf.length} bytes)`);
      return result.url;
    }
    const fullPath = path.join(this.devDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buf);
    const url = `file://${fullPath}`;
    this.logger.log(`[oss] dev-wrote ${key} (${buf.length} bytes) → ${url}`);
    return url;
  }

  /**
   * Generate a short-lived signed URL for the client to
   * download the result without exposing AK/SK. Ali-oss
   * `signatureUrl` is the standard; in dev we return the
   * file:// URL since there's no signing surface.
   */
  async signedUrl(key: string, expiresInSec = 300): Promise<string> {
    if (this.client) {
      return this.client.signatureUrl(key, { expires: expiresInSec });
    }
    const fullPath = path.join(this.devDir, key);
    return `file://${fullPath}`;
  }
}
