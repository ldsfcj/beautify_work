import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { promises as fs, createReadStream } from 'fs';
import * as path from 'path';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { OssService } from './oss.service';

/**
 * Multer's runtime hands us a buffer + a few metadata fields;
 * `@types/multer` would normally augment the global Express
 * namespace with the `Multer.File` interface, but it's not a
 * project dep (multer ships its own JS types). The local alias
 * keeps the controller strongly typed without pulling in
 * another @types/* package.
 */
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface PresignBody {
  key: string;
  contentType: string;
  expiresIn?: number;
}

/**
 * Allow-list of image MIME types we accept. Restricting on the
 * server guards against the client claiming `image/jpeg` on the
 * presign but uploading something else (the OSS signature ties
 * Content-Type, so a mismatch fails at the bucket).
 */
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** Per-file cap. 15 MB gives headroom over a 12 MP phone photo
 * while still under the 413-prone region. */
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Key shape: `uploads/{userId}/{rest}` — the userId prefix is the
 * authorization gate. A caller can only ever generate presigned
 * URLs for keys under their own userId; submitting a key pointing
 * at another user's prefix is rejected at /generate/submit time.
 *
 * The `{rest}` segment is one filename-ish token with an extension
 * (slashes forbidden) so a key can never masquerade as a folder
 * traversal. The userId segment just needs to be non-empty — the
 * equality check after the match is the real authorization gate.
 */
const KEY_PATTERN = /^uploads\/([0-9a-zA-Z-]+)\/[\w-]+\.[a-z0-9]+$/;

function validateKeyOrThrow(key: string, userId: string): void {
  const m = KEY_PATTERN.exec(key);
  if (!m || m[1] !== userId) {
    throw new BadRequestException({
      code: 'INVALID_KEY',
      message: `key 必须是 uploads/{userId}/<file>.<ext> 格式`,
    });
  }
}

/**
 * OSS-facing HTTP surface.
 *
 *   PUT /api/oss/presign            issue a presigned PUT URL
 *   POST /api/oss/dev-upload/:key   dev-mode sink for the presign URL
 *   GET /api/oss/dev-file/:key      dev-mode read sink (serves the bytes)
 *
 * The presign endpoint always requires JWT (a real OSS URL
 * generated server-side is the security boundary). The dev-upload
 * sink is also JWT-gated — it lives on our own server so the same
 * token-bearer identity is enforced, with an extra key-prefix
 * check layered on top.
 *
 * dev-file is intentionally NOT auth-gated: by the time a user
 * has a `resultUrl` the listing / detail / download-url endpoints
 * have already authorized them, and signing local file paths
 * buys nothing (the file system is the same trust boundary as
 * the server process). The path-traversal check below is the
 * sole gate — anything that resolves outside `.oss-dev/` is
 * rejected with 400.
 */
@Controller('oss')
export class OssController {
  /** Files in `.oss-dev/` use these Content-Types. Anything
   * else is served as `application/octet-stream` so the browser
   * falls back to "download as file" rather than guessing wrong. */
  private static readonly EXT_TO_CT: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };

  constructor(private readonly oss: OssService) {}

  @Get('dev-file/:key(*)')
  @Public()
  async devFile(
    @Param('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    const decoded = decodeURIComponent(key);

    // Path-traversal guard: every segment must be a plain
    // name (no `..`, no leading dot, no backslash, no NUL).
    // The result key shape is `gen/<uuid>.jpg` and the upload
    // key shape is `uploads/<userId>/<file>.<ext>` — both
    // already match the `validateKeyOrThrow` allow-list, but
    // dev-file is unauthenticated so we re-validate here.
    for (const seg of decoded.split('/')) {
      if (!seg || seg === '..' || seg.startsWith('.') || seg.includes('\\') || seg.includes('\0')) {
        throw new BadRequestException({
          code: 'INVALID_KEY',
          message: 'key 含非法段',
        });
      }
    }

    const devDir = (this.oss as any).devDir as string;
    // In production a real OSS client is configured and signed
    // URLs are issued instead of dev-file paths. Refuse to
    // serve anything if we're not actually in dev mode — this
    // is a belt-and-suspenders gate on top of the path-
    // traversal check.
    if (!devDir) {
      throw new NotFoundException('文件不存在');
    }
    const fullPath = path.resolve(devDir, decoded);
    // Belt-and-suspenders: even with the segment check above,
    // the resolved path must stay under `devDir`. `path.resolve`
    // collapses `..`; if the result escapes, refuse.
    if (!fullPath.startsWith(devDir + path.sep) && fullPath !== devDir) {
      throw new BadRequestException({
        code: 'INVALID_KEY',
        message: 'key 解析后越界',
      });
    }
    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundException('文件不存在');
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = OssController.EXT_TO_CT[ext] ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // Dev convenience: cache for an hour so reloads are snappy.
    // The file is content-addressed by generation id, so a
    // stale cache is harmless (the row is `success` already).
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(fullPath).pipe(res);
  }

  @Put('presign')
  async presign(
    @CurrentUser() user: JwtPayload,
    @Body() body: PresignBody,
  ): Promise<{ url: string; key: string; expiresIn: number }> {
    if (!ALLOWED_TYPES.has(body.contentType)) {
      throw new BadRequestException({
        code: 'INVALID_CONTENT_TYPE',
        message: `不支持的图片类型: ${body.contentType}`,
      });
    }
    if (!body.key) {
      throw new BadRequestException({
        code: 'INVALID_KEY',
        message: 'key 必填',
      });
    }
    validateKeyOrThrow(body.key, user.id);
    const expiresIn = Math.min(600, Math.max(60, body.expiresIn ?? 300));
    return this.oss.getUploadSignature(body.key, body.contentType, expiresIn);
  }

  @Post('dev-upload/:key(*)')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async devUpload(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @UploadedFile() file: MulterFile,
  ): Promise<{ ok: true; key: string; bytes: number }> {
    // The key came in URL-encoded; multer's buffer carries the
    // raw bytes. Nest's path-param matching respects (*) so the
    // colon segments inside the key survive intact.
    const decoded = decodeURIComponent(key);
    validateKeyOrThrow(decoded, user.id);

    if (!file) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: '没有收到文件',
      });
    }
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_CONTENT_TYPE',
        message: `不支持的图片类型: ${file.mimetype}`,
      });
    }
    await this.oss.upload(decoded, file.buffer, file.mimetype);
    return { ok: true, key: decoded, bytes: file.size };
  }
}
