import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
});
