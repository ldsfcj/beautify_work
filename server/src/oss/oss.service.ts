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
   * Build the server-relative URL the dev-mode controller uses
   * to serve a file out of `.oss-dev/`. Same encoding shape
   * (`encodeURIComponent` on each `/`-separated segment) as
   * `getUploadSignature`'s dev-upload path so the frontend can
   * use one decoder for both. Returns `/api/oss/dev-file/:key`
   * — same origin, same auth surface, no CORS dance.
   */
  private devFileUrl(key: string): string {
    return `/api/oss/dev-file/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /**
   * Upload a buffer and return the public-ish URL the worker
   * (and later the download-url endpoint, Task 26) can use.
   *
   *   - real OSS → `https://<bucket>.<endpoint>/<key>`
   *   - dev FS   → `/api/oss/dev-file/:key`  (served by OssController)
   *
   * The earlier dev shape was `file://<abs path>`, which the
   * browser refuses to load from a `http://localhost` page —
   * the result image rendered as a broken (often black) box
   * under Vant. Routing dev reads through our own controller
   * gives the same load semantics as the production signed
   * URL flow, with no CORS or same-origin surprise.
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
    const url = this.devFileUrl(key);
    this.logger.log(`[oss] dev-wrote ${key} (${buf.length} bytes) → ${url}`);
    return url;
  }

  /**
   * Generate a short-lived signed URL for the client to
   * download the result without exposing AK/SK. Ali-oss
   * `signatureUrl` is the standard; in dev we return the
   * server-relative `/api/oss/dev-file/:key` path (no
   * signing surface, but the controller is auth-gated at
   * the OSS module level for inputs; for outputs the
   * dev-file endpoint is open by design — see its doc).
   *
   * The DB stores the public/CDN URL (returned by `upload`),
   * not the OSS key, because the worker hands the result
   * straight to `generations.result_url`. So the input here
   * is usually a fully-formed URL, not a key. We must be
   * idempotent — if the input is already a dev-file URL,
   * pass it through instead of double-encoding it into
   * `/api/oss/dev-file/%2Fapi%2Foss%2Fdev-file%2F...`.
   */
  async signedUrl(key: string, expiresInSec = 300): Promise<string> {
    if (this.client) {
      return this.client.signatureUrl(key, { expires: expiresInSec });
    }
    if (key.startsWith('/api/oss/dev-file/')) {
      return key;
    }
    return this.devFileUrl(key);
  }

  /**
   * Issue a presigned PUT URL the client uses to upload directly
   * to OSS, bypassing the API server. The signature binds:
   *
   *   - HTTP method = PUT
   *   - Content-Type the client declares
   *   - 5-min expiry by default
   *
   * Ali-oss `signatureUrl` accepts `method: 'PUT'`; the returned
   * URL embeds the OSSAccessKeyId + signature + expires query
   * params and the Content-Type subresource so the receiver can
   * reject mismatched uploads.
   *
   * In dev (no AK/SK) we return a relative URL pointing to our
   * own `PUT /api/oss/dev-upload/:key` endpoint. The client code
   * is identical in both modes — same `axios.put(presigned, file)`
   * call — only the host differs.
   */
  async getUploadSignature(
    key: string,
    contentType: string,
    expiresInSec = 300,
  ): Promise<{ url: string; key: string; expiresIn: number }> {
    if (this.client) {
      const url = await this.client.signatureUrl(key, {
        method: 'PUT',
        expires: expiresInSec,
        // Ali-oss treats unknown subresources as passthrough query
        // params; on the OSS side the request must carry this exact
        // Content-Type header or the signature mismatches.
        'Content-Type': contentType,
      } as any);
      return { url, key, expiresIn: expiresInSec };
    }
    return {
      url: `/api/oss/dev-upload/${encodeURIComponent(key)}`,
      key,
      expiresIn: expiresInSec,
    };
  }

  /**
   * Sanity-check whether a key exists. Used by the /generate/submit
   * handler to reject bogus keys the client constructed but never
   * uploaded.
   *
   * Ali-oss `head()` is a HEAD on the object; a missing key throws
   * with `code: 'NoSuchKey'` and HTTP 404. In dev we stat the file.
   */
  async exists(key: string): Promise<boolean> {
    if (this.client) {
      try {
        await this.client.head(key);
        return true;
      } catch (e: any) {
        if (e?.status === 404 || e?.code === 'NoSuchKey') return false;
        throw e;
      }
    }
    try {
      await fs.access(path.join(this.devDir, key));
      return true;
    } catch {
      return false;
    }
  }
}
