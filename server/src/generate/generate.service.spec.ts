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

// ───────────────────────────────────────────────────────────────────
// Read paths must wrap the stored OSS keys (bare, e.g. `uploads/<id>/x`)
// through `OssService.signedUrl()` so the browser can actually load
// them. Without the wrap, `<img :src="originalUrl">` resolves the
// key as a same-origin relative path and 404s — the result page's
// left side (the user's own photo) stays blank.
// ───────────────────────────────────────────────────────────────────
describe('GenerateService read paths wrap stored OSS keys', () => {
  const USER_ID = 'user-1';
  const GEN_ID = 'gen-1';
  const RAW_ORIGINAL = `uploads/${USER_ID}/1781170297835_xsp38pn1.png`;
  const RAW_RESULT = `gen/ef0bb34c-12e9-4a5f-a2e6-0f802775b444.jpg`;
  const SIGNED_ORIGINAL = `/api/oss/dev-file/uploads/${USER_ID}/1781170297835_xsp38pn1.png`;
  const SIGNED_RESULT = `/api/oss/dev-file/gen/ef0bb34c-12e9-4a5f-a2e6-0f802775b444.jpg`;

  let service: GenerateService;
  let gens: jest.Mocked<Pick<Repository<Generation>, 'findOne' | 'findAndCount'>>;
  let oss: { signedUrl: jest.Mock; exists: jest.Mock };

  beforeEach(async () => {
    gens = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    } as any;
    // signedUrl is a thin pass-through to the real OssService in
    // dev mode — the helper in the service should hand the raw
    // column value to it. The dev-mode OssService returns
    // `/api/oss/dev-file/...` for a bare key, which is what we
    // assert against. (Prod-mode signatureUrl isn't on the dev
    // path so we don't mock it.)
    oss = {
      signedUrl: jest.fn(async (key: string) => `/api/oss/dev-file/${key}`),
      exists: jest.fn().mockResolvedValue(true),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GenerateService,
        { provide: getRepositoryToken(Generation), useValue: gens },
        { provide: getRepositoryToken(SystemConfig), useValue: { findOneBy: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(AiCallLog), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(DownloadLog), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: 'BULL_QUEUE_AI_GENERATE', useValue: { add: jest.fn() } },
        { provide: CreditLedgerService, useValue: { consume: jest.fn(), refund: jest.fn() } },
        { provide: REDIS_CLIENT, useValue: { eval: jest.fn().mockResolvedValue(1) } },
        { provide: NotificationService, useValue: { create: jest.fn() } },
        { provide: OssService, useValue: oss },
      ],
    }).compile();

    service = moduleRef.get(GenerateService);
  });

  function mockRow(overrides: Partial<Generation> = {}): Generation {
    return {
      id: GEN_ID,
      userId: USER_ID,
      originalUrl: RAW_ORIGINAL,
      resultUrl: RAW_RESULT,
      presetKeys: ['nose_bridge_lift'],
      promptText: 'subtle',
      modelUsed: 'wanx-v1-mock',
      creditsCost: 2,
      status: GenerationStatus.SUCCESS,
      errorMsg: null,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      createdAt: new Date(),
      ...overrides,
    } as Generation;
  }

  it('detail() returns the row with originalUrl/resultUrl wrapped through signedUrl', async () => {
    gens.findOne.mockResolvedValue(mockRow() as any);

    const { generation } = await service.detail(USER_ID, GEN_ID);

    // Both URLs must be wrapped — the right side (result) AND
    // the left side of the compare slider (original). Without
    // the wrap, the browser sees the raw key and 404s.
    expect(generation.originalUrl).toBe(SIGNED_ORIGINAL);
    expect(generation.resultUrl).toBe(SIGNED_RESULT);
    expect(oss.signedUrl).toHaveBeenCalledWith(RAW_ORIGINAL, expect.any(Number));
    expect(oss.signedUrl).toHaveBeenCalledWith(RAW_RESULT, expect.any(Number));
  });

  it('list() wraps originalUrl/resultUrl on every item in the page', async () => {
    const rows = [
      mockRow({ id: 'gen-a' }),
      mockRow({ id: 'gen-b', originalUrl: `uploads/${USER_ID}/b.jpg`, resultUrl: 'gen/b.jpg' }),
    ];
    gens.findAndCount.mockResolvedValue([rows as any, 2]);

    const out = await service.list(USER_ID, { page: 1, pageSize: 20 });

    expect(out.items).toHaveLength(2);
    for (const item of out.items) {
      expect(item.originalUrl).toMatch(/^\/api\/oss\/dev-file\//);
      expect(item.resultUrl).toMatch(/^\/api\/oss\/dev-file\//);
      // Must NOT echo the raw key — the bug we're fixing.
      expect(item.originalUrl).not.toBe(RAW_ORIGINAL);
      expect(item.resultUrl).not.toBe(RAW_RESULT);
    }
  });

  it('status() only wraps resultUrl when the generation is SUCCESS', async () => {
    // While pending/processing, resultUrl is null in the DB —
    // signedUrl must NOT be called with a null/undefined input.
    gens.findOne.mockResolvedValue(mockRow({ status: GenerationStatus.PENDING, resultUrl: null }) as any);

    const s = await service.status(USER_ID, GEN_ID);

    expect(s.status).toBe(GenerationStatus.PENDING);
    expect(s.result_url).toBeNull();
    // signedUrl should not have been invoked for a null result.
    expect(oss.signedUrl).not.toHaveBeenCalled();

    // On success it must wrap.
    gens.findOne.mockResolvedValue(mockRow() as any);
    const s2 = await service.status(USER_ID, GEN_ID);
    expect(s2.result_url).toBe(SIGNED_RESULT);
    expect(oss.signedUrl).toHaveBeenCalledWith(RAW_RESULT, expect.any(Number));
  });

  it('list() is robust when resultUrl is null (e.g. still pending)', async () => {
    const rows = [mockRow({ id: 'gen-pending', resultUrl: null, status: GenerationStatus.PENDING })];
    gens.findAndCount.mockResolvedValue([rows as any, 1]);

    const out = await service.list(USER_ID, {});

    // originalUrl still gets wrapped (the row is real), resultUrl
    // stays null because there's nothing to sign yet.
    expect(out.items[0].originalUrl).toBe(SIGNED_ORIGINAL);
    expect(out.items[0].resultUrl).toBeNull();
  });
});
