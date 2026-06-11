import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
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
 *   PUT /api/oss/dev-upload/:key    dev-mode sink for the presign URL
 *
 * The presign endpoint always requires JWT (a real OSS URL
 * generated server-side is the security boundary). The dev-upload
 * sink is also JWT-gated — it lives on our own server so the same
 * token-bearer identity is enforced, with an extra key-prefix
 * check layered on top.
 */
@Controller('oss')
export class OssController {
  constructor(private readonly oss: OssService) {}

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
