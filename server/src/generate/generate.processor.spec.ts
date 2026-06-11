import { GenerateProcessor } from './generate.processor';
import { AiService } from '../ai/ai.service';
import { WatermarkService } from '../ai/image-watermark';
import { OssService } from '../oss/oss.service';
import { CreditLedgerService } from '../credit/creditledger.service';
import { NotificationService } from '../notification/notification.service';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { Repository } from 'typeorm';

/**
 * The worker tests cover the happy path and the failure path
 * (where the AI service throws). We don't exercise the Bull
 * queue itself — that's an integration test (Task 35 P5
 * verification). What we DO verify is the worker's contract:
 * success → row=success, notification, log; failure → release
 * burst, log the failure, rethrow so Bull retries.
 */
describe('GenerateProcessor', () => {
  let processor: GenerateProcessor;
  let ai: jest.Mocked<Pick<AiService, 'generate'>>;
  let watermark: jest.Mocked<Pick<WatermarkService, 'add'>>;
  let oss: jest.Mocked<Pick<OssService, 'upload' | 'signedUrl'>>;
  let ledger: jest.Mocked<Pick<CreditLedgerService, 'consume' | 'refund'>>;
  let notif: jest.Mocked<Pick<NotificationService, 'create'>>;
  let gens: jest.Mocked<Pick<Repository<Generation>, 'update'>> & { create?: any };
  let aiLogs: jest.Mocked<Pick<Repository<AiCallLog>, 'create' | 'save'>>;
  let redis: { decr: jest.Mock };

  // Queue payloads now carry OSS keys (cheap, no expiry). The
  // worker signs them right before the AI call.
  const OSS_KEY = 'uploads/user-1/test.jpg';
  const SIGNED_URL = 'https://oss.example.com/signed/u1.jpg';

  const job = {
    data: {
      generationId: 'gen-1',
      userId: 'user-1',
      imageUrl: OSS_KEY,
      presetKeys: ['nose_bridge_lift'],
      text: null,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as any;

  beforeEach(() => {
    ai = {
      generate: jest.fn().mockResolvedValue({
        resultBuffer: Buffer.from('result-bytes'),
        modelUsed: 'mock',
        costCents: 5,
        latencyMs: 200,
      }),
    } as any;
    watermark = { add: jest.fn().mockImplementation(async (b: Buffer) => b) } as any;
    oss = {
      upload: jest.fn().mockResolvedValue('https://oss.example.com/gen/gen-1.jpg'),
      signedUrl: jest.fn().mockResolvedValue(SIGNED_URL),
    } as any;
    ledger = { consume: jest.fn(), refund: jest.fn() } as any;
    notif = { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } as any;
    gens = { update: jest.fn().mockResolvedValue({ affected: 1 }) } as any;
    aiLogs = {
      create: jest.fn((x: any) => x),
      save: jest.fn().mockResolvedValue({ id: 'log-1' }),
    } as any;
    redis = { decr: jest.fn().mockResolvedValue(0) } as any;

    processor = new GenerateProcessor(
      ai as any,
      watermark as any,
      oss as any,
      ledger as any,
      notif as any,
      gens as unknown as Repository<Generation>,
      aiLogs as unknown as Repository<AiCallLog>,
      redis as any,
    );
  });

  it('happy path: signs key, watermarks, uploads, marks success, sends notification, logs call', async () => {
    await processor.process(job);

    // Worker signs the queued OSS key into a 5-min URL right
    // before calling the AI service. The signed URL — not the
    // raw key — is what AIService fetches.
    expect(oss.signedUrl).toHaveBeenCalledWith(OSS_KEY, 300);
    expect(ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({ imageSignedUrl: SIGNED_URL }),
    );
    expect(watermark.add).toHaveBeenCalledWith(Buffer.from('result-bytes'));
    const uploadCall = (oss.upload as jest.Mock).mock.calls[0];
    expect(uploadCall[0]).toBe('gen/gen-1.jpg');
    expect(Buffer.isBuffer(uploadCall[1])).toBe(true);
    expect(gens.update).toHaveBeenCalledWith(
      'gen-1',
      expect.objectContaining({
        status: GenerationStatus.SUCCESS,
        resultUrl: 'https://oss.example.com/gen/gen-1.jpg',
        modelUsed: 'mock',
      }),
    );
    expect(notif.create).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'generation_done',
      title: '生成完成',
      body: '查看您的 AI 预览图',
      payload: { generation_id: 'gen-1' },
    });
    expect(aiLogs.save).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, model: 'mock' }),
    );
    // Burst is always released
    expect(redis.decr).toHaveBeenCalledWith('rl:ai:b:user-1');
  });

  it('AI failure: logs the failure, releases burst, rethrows for Bull retry', async () => {
    ai.generate.mockRejectedValueOnce(new Error('mock threw'));

    await expect(processor.process(job)).rejects.toThrow('mock threw');

    expect(aiLogs.save).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'WORKER_ERROR' }),
    );
    expect(redis.decr).toHaveBeenCalledWith('rl:ai:b:user-1');
    // We do NOT mark the row failed here — AIService.failAndRefund
    // does that for permanent errors, and we rethrow so Bull
    // retries on transient ones. The row stays `pending` until
    // AIService's own logic decides it's permanent.
  });

  it('OSS upload failure: still releases burst and rethrows', async () => {
    oss.upload.mockRejectedValueOnce(new Error('oss down'));

    await expect(processor.process(job)).rejects.toThrow('oss down');

    expect(redis.decr).toHaveBeenCalledWith('rl:ai:b:user-1');
    expect(aiLogs.save).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});
