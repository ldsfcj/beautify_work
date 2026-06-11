import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OssController } from './oss.controller';
import { OssService } from './oss.service';

/**
 * OssController tests — verify the presign + dev-upload
 * endpoints enforce content-type, key shape, and userId ownership
 * before delegating to OssService.
 */
describe('OssController', () => {
  let controller: OssController;
  let oss: jest.Mocked<Pick<OssService, 'getUploadSignature' | 'upload'>>;

  const USER = { id: 'user-1', type: 'user' as const };
  const VALID_KEY = `uploads/${USER.id}/photo.jpg`;

  beforeEach(async () => {
    oss = {
      getUploadSignature: jest.fn().mockResolvedValue({
        url: '/api/oss/dev-upload/uploads%2Fuser-1%2Fphoto.jpg',
        key: VALID_KEY,
        expiresIn: 300,
      }),
      upload: jest.fn().mockResolvedValue(`file:///tmp/photo.jpg`),
    } as any;

    const moduleRef = await Test.createTestingModule({
      controllers: [OssController],
      providers: [{ provide: OssService, useValue: oss }],
    }).compile();

    controller = moduleRef.get(OssController);
  });

  // ── presign ──────────────────────────────────────────────────────

  describe('PUT /presign', () => {
    it('returns presigned URL for a valid request', async () => {
      const result = await controller.presign(USER as any, {
        key: VALID_KEY,
        contentType: 'image/jpeg',
      });

      expect(result).toEqual({
        url: expect.any(String),
        key: VALID_KEY,
        expiresIn: expect.any(Number),
      });
      expect(oss.getUploadSignature).toHaveBeenCalledWith(
        VALID_KEY,
        'image/jpeg',
        300,
      );
    });

    it('passes through custom expiresIn (clamped to 60–600)', async () => {
      await controller.presign(USER as any, {
        key: VALID_KEY,
        contentType: 'image/jpeg',
        expiresIn: 120,
      });
      expect(oss.getUploadSignature).toHaveBeenCalledWith(
        VALID_KEY,
        'image/jpeg',
        120,
      );
    });

    it('clamps expiresIn below 60 to 60', async () => {
      await controller.presign(USER as any, {
        key: VALID_KEY,
        contentType: 'image/jpeg',
        expiresIn: 10,
      });
      expect(oss.getUploadSignature).toHaveBeenCalledWith(
        VALID_KEY,
        'image/jpeg',
        60,
      );
    });

    it('clamps expiresIn above 600 to 600', async () => {
      await controller.presign(USER as any, {
        key: VALID_KEY,
        contentType: 'image/jpeg',
        expiresIn: 9999,
      });
      expect(oss.getUploadSignature).toHaveBeenCalledWith(
        VALID_KEY,
        'image/jpeg',
        600,
      );
    });

    it('rejects an unsupported contentType with 400', async () => {
      await expect(
        controller.presign(USER as any, {
          key: VALID_KEY,
          contentType: 'video/mp4',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(oss.getUploadSignature).not.toHaveBeenCalled();
    });

    it('rejects a missing key with 400', async () => {
      await expect(
        controller.presign(USER as any, {
          key: '',
          contentType: 'image/jpeg',
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_KEY' },
      });

      expect(oss.getUploadSignature).not.toHaveBeenCalled();
    });

    it('rejects a malformed key with 400', async () => {
      await expect(
        controller.presign(USER as any, {
          key: 'not/a/valid/key',
          contentType: 'image/jpeg',
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_KEY' },
      });

      expect(oss.getUploadSignature).not.toHaveBeenCalled();
    });

    it("rejects a key whose userId prefix doesn't match the caller", async () => {
      await expect(
        controller.presign(USER as any, {
          key: 'uploads/other-user/photo.jpg',
          contentType: 'image/jpeg',
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_KEY' },
      });

      expect(oss.getUploadSignature).not.toHaveBeenCalled();
    });
  });

  // ── dev-upload ───────────────────────────────────────────────────

  describe('POST /dev-upload/:key', () => {
    const FILE = {
      fieldname: 'file',
      originalname: 'photo.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('fake-image'),
    };

    it('uploads file via OssService.upload and returns ok', async () => {
      const result = await controller.devUpload(
        USER as any,
        encodeURIComponent(VALID_KEY),
        FILE,
      );

      expect(result).toEqual({ ok: true, key: VALID_KEY, bytes: 1024 });
      expect(oss.upload).toHaveBeenCalledWith(
        VALID_KEY,
        FILE.buffer,
        'image/jpeg',
      );
    });

    it('rejects when no file is attached with 400', async () => {
      await expect(
        controller.devUpload(USER as any, encodeURIComponent(VALID_KEY), null as any),
      ).rejects.toMatchObject({
        response: { code: 'EMPTY_FILE' },
      });

      expect(oss.upload).not.toHaveBeenCalled();
    });

    it('rejects an unsupported file mimetype with 400', async () => {
      const badFile = { ...FILE, mimetype: 'application/pdf' };

      await expect(
        controller.devUpload(USER as any, encodeURIComponent(VALID_KEY), badFile),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CONTENT_TYPE' },
      });

      expect(oss.upload).not.toHaveBeenCalled();
    });

    it("rejects a key whose userId doesn't match the caller", async () => {
      await expect(
        controller.devUpload(
          USER as any,
          encodeURIComponent('uploads/other-user/photo.jpg'),
          FILE,
        ),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_KEY' },
      });

      expect(oss.upload).not.toHaveBeenCalled();
    });
  });

  // ── dev-file ─────────────────────────────────────────────────────
  // The dev-file endpoint is what makes the upload/download
  // dev flow actually viewable in a browser. Earlier dev mode
  // returned `file://` URLs that the browser refused to load
  // (rendering as a broken / black image), so this endpoint is
  // the load-bearing piece of the dev-fallback story. Path-
  // traversal hardening is the security gate since the
  // endpoint is unauthenticated by design.

  describe('GET /dev-file/:key', () => {
    let tmpRoot: string;

    beforeEach(async () => {
      tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'oss-ctrl-test-'));
      // Point the service's devDir at our tmpdir so writes
      // are isolated from the real `.oss-dev/`.
      (controller as any).oss.devDir = path.join(tmpRoot, '.oss-dev');
    });

    afterEach(async () => {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    });

    function mockRes() {
      // Express's response object is a Writable stream. The
      // controller calls `createReadStream(...).pipe(res)` and
      // `pipe()` requires the destination to expose `on()` /
      // `write()` / `end()`. EventEmitter gives us `on()` and a
      // `pipe()` shim records the call.
      const ee = new EventEmitter() as any;
      const headers: Record<string, string> = {};
      ee.setHeader = jest.fn((k: string, v: string) => { headers[k] = v; });
      ee.getHeader = jest.fn((k: string) => headers[k]);
      ee._headers = headers;
      ee.pipe = jest.fn().mockReturnValue(ee);
      ee.write = jest.fn();
      ee.end = jest.fn();
      return ee;
    }

    it('streams an existing file with the correct Content-Type', async () => {
      const key = 'gen/abc.jpg';
      const fullPath = path.join(tmpRoot, '.oss-dev', 'gen', 'abc.jpg');
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from('jpeg-bytes-here'));

      const res = mockRes();
      // We don't observe the streamed bytes here — `pipe()` is
      // a source-stream operation, not a dest method, so any
      // mock of `res.pipe` would be wrong. The fact that the
      // call didn't throw + the headers landed is enough proof
      // the controller reached the streaming line.
      await expect(controller.devFile(key, res)).resolves.toBeUndefined();
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        expect.stringContaining('max-age='),
      );
    });

    it('uses image/png for .png keys', async () => {
      const key = 'gen/xyz.png';
      const fullPath = path.join(tmpRoot, '.oss-dev', 'gen', 'xyz.png');
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from('png-bytes'));

      const res = mockRes();
      await controller.devFile(key, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    });

    it('falls back to application/octet-stream for unknown extensions', async () => {
      const key = 'gen/foo.bin';
      const fullPath = path.join(tmpRoot, '.oss-dev', 'gen', 'foo.bin');
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from('whatever'));

      const res = mockRes();
      await controller.devFile(key, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('returns 404 when the key has nothing on disk', async () => {
      await expect(
        controller.devFile('gen/missing.jpg', mockRes()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects keys with `..` segments to block traversal', async () => {
      await expect(
        controller.devFile('../etc/passwd', mockRes()),
      ).rejects.toMatchObject({ response: { code: 'INVALID_KEY' } });
    });

    it('rejects keys with leading-dot segments', async () => {
      await expect(
        controller.devFile('.oss-dev/.git/HEAD', mockRes()),
      ).rejects.toMatchObject({ response: { code: 'INVALID_KEY' } });
    });

    it('rejects keys that resolve outside devDir (e.g. absolute escape)', async () => {
      // A path like `gen/../../etc/passwd` — segments individually
      // pass the bad-segment check (`..` is caught above), but a
      // path with only one `..` sandwiched could slip past the
      // per-segment rule if the segment rule had a hole. Belt-
      // and-suspenders: the resolved path must stay under devDir.
      // (Covered indirectly above by the `..` test; keeping this
      // here as a sentinel for future refactors.)
      await expect(
        controller.devFile('gen/../etc/passwd', mockRes()),
      ).rejects.toMatchObject({ response: { code: 'INVALID_KEY' } });
    });
  });
});
