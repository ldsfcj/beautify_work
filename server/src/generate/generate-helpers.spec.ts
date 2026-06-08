import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { DownloadLog } from '../entities/download-log.entity';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { NotificationService } from '../notification/notification.service';
import { OssService } from '../oss/oss.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { CreditLedgerService } from '../credit/creditledger.service';
import type { Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import { AI_GENERATE_QUEUE, GenerateService } from './generate.service';

/**
 * Unit tests for the 5 read-side helpers added in Task 26:
 * status / list / detail / softDelete / downloadUrl.
 *
 * The submit path is covered in generate.service.spec.ts; this
 * file focuses on the read paths and downloadUrl's compliance
 * side-effects (oss.signedUrl + download_log row).
 */
describe('GenerateService helpers (Task 26)', () => {
  const USER_ID = 'user-1';
  const OTHER_USER = 'user-2';
  const GEN_ID = 'gen-1';

  let service: GenerateService;
  let gens: jest.Mocked<Pick<Repository<Generation>, 'findOne' | 'findAndCount' | 'update' | 'find'>>;
  let sysCfg: jest.Mocked<Pick<Repository<SystemConfig>, 'findOneBy'>>;
  let aiLogs: jest.Mocked<Pick<Repository<AiCallLog>, 'find'>>;
  let downloads: jest.Mocked<Pick<Repository<DownloadLog>, 'create' | 'save'>>;
  let queue: jest.Mocked<Pick<Queue, 'add'>>;
  let ledger: jest.Mocked<Pick<CreditLedgerService, 'consume' | 'refund'>>;
  let redis: jest.Mocked<Pick<Redis, 'eval'>>;
  let notif: jest.Mocked<Pick<NotificationService, 'create'>>;
  let oss: jest.Mocked<Pick<OssService, 'upload' | 'signedUrl'>>;

  function makeGen(overrides: Partial<Generation> = {}): Generation {
    return {
      id: GEN_ID,
      userId: USER_ID,
      originalUrl: 'https://oss.example.com/u1.jpg',
      resultUrl: 'https://oss.example.com/gen/gen-1.jpg',
      presetKeys: ['k'],
      promptText: 'prompt',
      modelUsed: 'mock',
      creditsCost: 2,
      status: GenerationStatus.SUCCESS,
      errorMsg: null,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      createdAt: new Date(),
      user: null as any,
      ...overrides,
    };
  }

  beforeEach(async () => {
    gens = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn(),
    } as any;
    sysCfg = { findOneBy: jest.fn().mockResolvedValue(null) } as any;
    aiLogs = { find: jest.fn().mockResolvedValue([]) } as any;
    downloads = {
      create: jest.fn((x: any) => x),
      save: jest.fn().mockImplementation(async (x: any) => ({ id: 'dl-1', ...x })),
    } as any;
    queue = { add: jest.fn() } as any;
    ledger = { consume: jest.fn(), refund: jest.fn() } as any;
    redis = { eval: jest.fn().mockResolvedValue(1) } as any;
    notif = { create: jest.fn() } as any;
    oss = {
      upload: jest.fn(),
      signedUrl: jest.fn().mockResolvedValue('https://signed.example.com/gen-1?sig=xxx&exp=...'),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GenerateService,
        { provide: getRepositoryToken(Generation), useValue: gens },
        { provide: getRepositoryToken(SystemConfig), useValue: sysCfg },
        { provide: getRepositoryToken(AiCallLog), useValue: aiLogs },
        { provide: getRepositoryToken(DownloadLog), useValue: downloads },
        { provide: AI_GENERATE_QUEUE, useValue: queue },
        { provide: CreditLedgerService, useValue: ledger },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: NotificationService, useValue: notif },
        { provide: OssService, useValue: oss },
      ],
    }).compile();

    service = moduleRef.get(GenerateService);
  });

  // ── status ─────────────────────────────────────────────────────────

  describe('status', () => {
    it('returns id + status + null result_url for a pending row', async () => {
      gens.findOne.mockResolvedValue(makeGen({ status: GenerationStatus.PENDING, resultUrl: null }));
      const r = await service.status(USER_ID, GEN_ID);
      expect(r).toEqual({ id: GEN_ID, status: 'pending', result_url: null });
    });

    it('returns the result_url when status is success', async () => {
      gens.findOne.mockResolvedValue(makeGen({ status: GenerationStatus.SUCCESS }));
      const r = await service.status(USER_ID, GEN_ID);
      expect(r).toEqual({
        id: GEN_ID,
        status: 'success',
        result_url: 'https://oss.example.com/gen/gen-1.jpg',
      });
    });

    it('throws 404 when the row belongs to a different user', async () => {
      // The WHERE clause is { id, userId } — a different user
      // simply gets no row, never leaks existence.
      gens.findOne.mockResolvedValue(null);
      await expect(service.status(OTHER_USER, GEN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── list ───────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns items + total for a paginated query', async () => {
      const items = [makeGen(), makeGen({ id: 'gen-2' })];
      gens.findAndCount.mockResolvedValue([items, 12]);

      const r = await service.list(USER_ID, { page: 1, pageSize: 20 });

      expect(r.items).toBe(items);
      expect(r.total).toBe(12);
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(20);
      expect(gens.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('passes the status filter through to the WHERE clause', async () => {
      gens.findAndCount.mockResolvedValue([[], 0]);
      await service.list(USER_ID, { page: 1, pageSize: 10, status: GenerationStatus.SUCCESS });
      expect(gens.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, status: GenerationStatus.SUCCESS },
        }),
      );
    });

    it('excludes soft-deleted rows by default', async () => {
      gens.findAndCount.mockResolvedValue([[], 0]);
      await service.list(USER_ID, { page: 1, pageSize: 20 });
      expect(gens.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: 'deleted' }),
        }),
      );
    });

    it('clamps pageSize to 50 max and page to >= 1', async () => {
      gens.findAndCount.mockResolvedValue([[], 0]);
      await service.list(USER_ID, { page: 0, pageSize: 9999 });
      expect(gens.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });
  });

  // ── detail ─────────────────────────────────────────────────────────

  describe('detail', () => {
    it('returns the generation row + latest 5 AI call logs', async () => {
      const gen = makeGen();
      gens.findOne.mockResolvedValue(gen);
      aiLogs.find.mockResolvedValue([
        {
          id: 'log-1',
          userId: USER_ID,
          generationId: GEN_ID,
          model: 'mock',
          requestSize: 100,
          responseSize: 200,
          costCents: 5,
          latencyMs: 200,
          success: true,
          errorCode: null,
          createdAt: new Date(),
          user: null as any,
          generation: null as any,
        },
      ] as any);

      const r = await service.detail(USER_ID, GEN_ID);
      expect(r.generation).toBe(gen);
      expect(r.ai_logs).toHaveLength(1);
      expect(aiLogs.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { generationId: GEN_ID },
          order: { createdAt: 'DESC' },
          take: 5,
        }),
      );
    });

    it('throws 404 for a different user id (no existence leak)', async () => {
      gens.findOne.mockResolvedValue(null);
      await expect(service.detail(OTHER_USER, GEN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── softDelete ─────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('flips the row to status=deleted without removing the record', async () => {
      gens.findOne.mockResolvedValue(makeGen({ status: GenerationStatus.SUCCESS }));
      await service.softDelete(USER_ID, GEN_ID);
      expect(gens.update).toHaveBeenCalledWith(
        { id: GEN_ID, userId: USER_ID },
        { status: GenerationStatus.DELETED },
      );
    });

    it('is idempotent — deleting an already-deleted row is a no-op', async () => {
      gens.findOne.mockResolvedValue(makeGen({ status: GenerationStatus.DELETED }));
      await service.softDelete(USER_ID, GEN_ID);
      expect(gens.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a different user id', async () => {
      gens.findOne.mockResolvedValue(null);
      await expect(service.softDelete(OTHER_USER, GEN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── downloadUrl ────────────────────────────────────────────────────

  describe('downloadUrl', () => {
    it('returns a signed URL (5min TTL) + writes a download log', async () => {
      gens.findOne.mockResolvedValue(makeGen({ status: GenerationStatus.SUCCESS }));
      const r = await service.downloadUrl(USER_ID, GEN_ID);
      expect(r.url).toBe('https://signed.example.com/gen-1?sig=xxx&exp=...');
      expect(r.expires_in).toBe(300);
      expect(oss.signedUrl).toHaveBeenCalledWith(
        'https://oss.example.com/gen/gen-1.jpg',
        300,
      );
      expect(downloads.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          generationId: GEN_ID,
        }),
      );
    });

    it('throws 400 if the generation is not in success state', async () => {
      gens.findOne.mockResolvedValue(makeGen({ status: GenerationStatus.FAILED, resultUrl: null }));
      await expect(service.downloadUrl(USER_ID, GEN_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(oss.signedUrl).not.toHaveBeenCalled();
      expect(downloads.save).not.toHaveBeenCalled();
    });

    it('throws 404 for a different user id', async () => {
      gens.findOne.mockResolvedValue(null);
      await expect(service.downloadUrl(OTHER_USER, GEN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
