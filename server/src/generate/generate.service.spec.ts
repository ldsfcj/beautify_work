import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import { CreditLedgerService } from '../credit/creditledger.service';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { DownloadLog } from '../entities/download-log.entity';
import { LedgerType } from '../entities/credit-ledger.entity';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { NotificationService } from '../notification/notification.service';
import { OssService } from '../oss/oss.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { Redis } from 'ioredis';
import { GenerateService } from './generate.service';

/**
 * generate.service is the 50ms hot path that the entire
 * generation flow rides on. The tests cover:
 *
 *   1. submit debits credits via CreditLedgerService.consume()
 *      and creates a pending Generation row
 *   2. the cost ladder (1/2/3/4 presets) maps to 2/3/4/5 credits
 *   3. the job is enqueued to Bull with the right payload
 *   4. INSUFFICIENT_CREDITS bubbles out of consume() and the
 *      queue is never touched
 *   5. rate limit trip throws 429 and the queue is never touched
 *   6. generationId from the response can be used to look up
 *      the row we just saved
 *   7. fallbackCost is used when credit_pricing_table is absent
 */
describe('GenerateService', () => {
  const USER_ID = 'user-1';
  const GEN_ID = 'gen-1';
  // Valid OSS key the new presigned-upload flow expects: must be
  // user-scoped and shaped `uploads/{userId}/<file>.<ext>`.
  const VALID_KEY = `uploads/${USER_ID}/test.jpg`;

  let service: GenerateService;
  let gens: jest.Mocked<Pick<Repository<Generation>, 'create' | 'save'>>;
  let sysCfg: jest.Mocked<Pick<Repository<SystemConfig>, 'findOneBy'>>;
  let queue: jest.Mocked<Pick<Queue, 'add'>>;
  let ledger: jest.Mocked<Pick<CreditLedgerService, 'consume' | 'refund'>>;
  let redis: jest.Mocked<Pick<Redis, 'eval'>>;
  let notif: jest.Mocked<Pick<NotificationService, 'create'>>;

  beforeEach(async () => {
    gens = {
      create: jest.fn((x: any) => ({ id: GEN_ID, ...x })),
      save: jest.fn(async (x: any) => ({ id: GEN_ID, ...x })),
    } as any;
    sysCfg = { findOneBy: jest.fn() } as any;
    sysCfg.findOneBy.mockResolvedValue(null);
    queue = { add: jest.fn().mockResolvedValue({}) } as any;
    ledger = {
      consume: jest.fn().mockResolvedValue({ balanceAfter: 0 }),
      refund: jest.fn().mockResolvedValue({ balanceAfter: 0 }),
    } as any;
    // Mock Redis eval: always allow. (Rate-limit semantics are
    // covered by rate-limiter.spec.ts; here we just need a
    // permissive stub so the submit path doesn't blow up.)
    redis = { eval: jest.fn().mockResolvedValue(1) } as any;
    notif = { create: jest.fn() } as any;
    // The submit path doesn't touch these, but the constructor
    // requires them; null is fine.
    const aiLogs = { find: jest.fn() } as any;
    const downloads = { create: jest.fn(), save: jest.fn() } as any;
    const oss = { signedUrl: jest.fn(), exists: jest.fn().mockResolvedValue(true) } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GenerateService,
        { provide: getRepositoryToken(Generation), useValue: gens },
        { provide: getRepositoryToken(SystemConfig), useValue: sysCfg },
        { provide: getRepositoryToken(AiCallLog), useValue: aiLogs },
        { provide: getRepositoryToken(DownloadLog), useValue: downloads },
        { provide: 'BULL_QUEUE_AI_GENERATE', useValue: queue },
        { provide: CreditLedgerService, useValue: ledger },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: NotificationService, useValue: notif },
        { provide: OssService, useValue: oss },
      ],
    }).compile();

    service = moduleRef.get(GenerateService);
  });

  it('submit debits credits, saves a pending generation, and enqueues the job', async () => {
    const result = await service.submit(USER_ID, {
      image_url: VALID_KEY,
      preset_keys: ['nose_bridge_lift'],
    });

    expect(result.generation_id).toBe(GEN_ID);

    expect(ledger.consume).toHaveBeenCalledTimes(1);
    const [callUserId, callAmount, callType] = (
      ledger.consume as jest.Mock
    ).mock.calls[0];
    expect(callUserId).toBe(USER_ID);
    expect(callAmount).toBe(2);
    expect(callType).toBe(LedgerType.CONSUME);

    expect(gens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        originalUrl: VALID_KEY,
        presetKeys: ['nose_bridge_lift'],
        creditsCost: 2,
        status: GenerationStatus.PENDING,
        expiresAt: expect.any(Date),
      }),
    );
    expect(gens.save).toHaveBeenCalled();

    expect(queue.add).toHaveBeenCalledWith(
      'edit',
      expect.objectContaining({
        generationId: GEN_ID,
        userId: USER_ID,
        imageUrl: VALID_KEY,
        presetKeys: ['nose_bridge_lift'],
      }),
      expect.objectContaining({
        attempts: expect.any(Number),
        backoff: expect.any(Object),
      }),
    );
  });

  it('uses the cost ladder 2/3/4/5 for 1/2/3/4 presets', async () => {
    for (const [n, expected] of [[1, 2], [2, 3], [3, 4], [4, 5]] as const) {
      (ledger.consume as jest.Mock).mockClear();
      (gens.save as jest.Mock).mockClear();
      await service.submit(USER_ID, {
        image_url: VALID_KEY,
        preset_keys: Array(n).fill('k'),
      });
      expect((ledger.consume as jest.Mock).mock.calls[0][1]).toBe(expected);
    }
  });

  it('caps cost at 5 credits for 5+ presets', async () => {
    (ledger.consume as jest.Mock).mockClear();
    await service.submit(USER_ID, {
      image_url: VALID_KEY,
      preset_keys: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect((ledger.consume as jest.Mock).mock.calls[0][1]).toBe(5);
  });

  it('reads custom pricing from system_configs.credit_pricing_table when set', async () => {
    sysCfg.findOneBy.mockResolvedValue({
      key: 'credit_pricing_table',
      value: { 1: 10, 2: 20, 3: 30, 4: 40 },
      updatedBy: 'admin',
      updatedAt: new Date(),
    } as SystemConfig);
    (ledger.consume as jest.Mock).mockClear();
    await service.submit(USER_ID, {
      image_url: VALID_KEY,
      preset_keys: ['a', 'b', 'c'],
    });
    expect((ledger.consume as jest.Mock).mock.calls[0][1]).toBe(30);
  });

  it('INSUFFICIENT_CREDITS bubbles out of consume and the queue is never touched', async () => {
    ledger.consume.mockRejectedValueOnce(
      new HttpException(
        { code: 'INSUFFICIENT_CREDITS', message: '积分不足' },
        HttpStatus.PAYMENT_REQUIRED,
      ),
    );

    await expect(
      service.submit(USER_ID, {
        image_url: VALID_KEY,
        preset_keys: ['a'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_CREDITS' },
      status: HttpStatus.PAYMENT_REQUIRED,
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(gens.save).not.toHaveBeenCalled();
  });

  it('refunds credits when generation save fails (post-debit rollback)', async () => {
    gens.save.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.submit(USER_ID, {
        image_url: VALID_KEY,
        preset_keys: ['a'],
      }),
    ).rejects.toThrow('db down');

    expect(ledger.refund).toHaveBeenCalledWith(
      USER_ID,
      2,
      'submit-rollback',
      expect.stringContaining('submit failed'),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rate-limit trip throws 429 and the queue is never touched', async () => {
    redis.eval.mockResolvedValueOnce(0);

    await expect(
      service.submit(USER_ID, {
        image_url: VALID_KEY,
        preset_keys: ['a'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'AI_RATE_LIMITED' },
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(ledger.consume).not.toHaveBeenCalled();
  });

  it('rejects an empty preset_keys array with a 400', async () => {
    await expect(
      service.submit(USER_ID, { image_url: VALID_KEY, preset_keys: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.consume).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects a malformed image_url (not a user-scoped OSS key) with a 400', async () => {
    await expect(
      service.submit(USER_ID, { image_url: 'x', preset_keys: ['a'] }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_IMAGE_KEY' },
    });
    expect(ledger.consume).not.toHaveBeenCalled();
  });

  it("rejects a key whose userId prefix doesn't match the caller", async () => {
    await expect(
      service.submit(USER_ID, {
        image_url: 'uploads/some-other-user-uuid/x.jpg',
        preset_keys: ['a'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_IMAGE_KEY' },
    });
    expect(ledger.consume).not.toHaveBeenCalled();
  });

  it('expiresAt is ~30 days from now', async () => {
    const before = Date.now();
    await service.submit(USER_ID, {
      image_url: VALID_KEY,
      preset_keys: ['a'],
    });
    const after = Date.now();
    const exp = (gens.create as jest.Mock).mock.calls[0][0].expiresAt as Date;
    const delta = exp.getTime() - before;
    // 30 days = 30 * 86400_000 ms; allow a 1s drift for the test clock.
    expect(delta).toBeGreaterThanOrEqual(30 * 86400_000 - 1000);
    expect(delta).toBeLessThanOrEqual(30 * 86400_000 + (after - before) + 1000);
  });

  it('rejects an OSS key that was never uploaded with IMAGE_NOT_UPLOADED', async () => {
    const ossExists = service['oss'].exists as jest.Mock;
    ossExists.mockResolvedValueOnce(false);

    await expect(
      service.submit(USER_ID, {
        image_url: VALID_KEY,
        preset_keys: ['a'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'IMAGE_NOT_UPLOADED' },
    });

    expect(ledger.consume).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
