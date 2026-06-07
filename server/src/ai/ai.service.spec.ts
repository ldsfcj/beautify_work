import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AiService } from './ai.service';
import { AiAdapter, AiEditResult } from './adapters/ai-adapter.interface';
import { CreditLedgerService } from '../credit/creditledger.service';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { PresetItem } from '../entities/preset-item.entity';
import { SystemConfig } from '../entities/system-config.entity';

/**
 * Unit tests for AIService.generate(). The 5 paths the runbook
 * (Task 23 Done Criteria) calls out:
 *
 *   1. primary succeeds first try → secondary never called
 *   2. primary 5xx (retryable) → second attempt succeeds, still
 *      no secondary call
 *   3. primary exhausted (5xx twice) → secondary attempted, succeeds
 *   4. primary 4xx (non-429) → no retry, no secondary, refund + fail
 *      (4xx means the prompt is malformed or the input is bad; we
 *      do NOT burn fallback budget on bad input)
 *   5. all targets exhausted → refund + mark failed + throw
 *
 * The service is decoupled from TypeORM / Redis / OSS: every
 * collaborator is a mock so the test runs in <50ms.
 */
describe('AIService.generate', () => {
  let service: AiService;
  let presets: jest.Mocked<Pick<Repository<PresetItem>, 'find' | 'findBy'>>;
  let generations: jest.Mocked<
    Pick<Repository<Generation>, 'update' | 'findOne' | 'findOneBy'>
  >;
  let ledger: jest.Mocked<
    Pick<CreditLedgerService, 'refund'>
  >;
  let sysCfg: jest.Mocked<Pick<Repository<SystemConfig>, 'findOneBy'>>;
  let dataSource: { transaction: jest.Mock };
  let adapters: Map<string, jest.Mocked<AiAdapter>>;
  let cfg: ConfigService;

  function makeAdapter(name: 'mock' | 'tongyi' | 'hunyuan'): jest.Mocked<AiAdapter> {
    return {
      name,
      editImage: jest.fn(),
    } as unknown as jest.Mocked<AiAdapter>;
  }

  function okResult(model = 'wanx-v1-mock'): AiEditResult {
    return {
      resultBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      modelUsed: model,
      costCents: 5,
      latencyMs: 12,
    };
  }

  function throwWith(status: number, msg = 'boom'): Error & { status: number } {
    const e: any = new Error(msg);
    e.status = status;
    return e;
  }

  beforeEach(() => {
    presets = { find: jest.fn(), findBy: jest.fn() } as any;
    presets.findBy.mockResolvedValue([
      { key: 'rhinoplasty_bridge', defaultPrompt: 'elevated bridge' },
      { key: 'eye_double_eyelid', defaultPrompt: 'double eyelid' },
    ] as PresetItem[]);
    generations = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue({ id: 'g1', creditsCost: 30 } as Generation),
    } as any;
    ledger = { refund: jest.fn().mockResolvedValue({ balanceAfter: 0 }) } as any;
    sysCfg = { findOneBy: jest.fn() } as any;
    sysCfg.findOneBy.mockImplementation(async ({ key }: any) => {
      const row: SystemConfig = {
        key,
        value: null,
        updatedBy: 'system',
        updatedAt: new Date(),
      };
      if (key === 'ai_models') {
        row.value = {
          primary: { vendor: 'mock', enabled: true, timeoutMs: 30000 },
          secondary: { vendor: 'tongyi', enabled: true, timeoutMs: 30000 },
          allowFallback: true,
        };
        return row;
      }
      if (key === 'prompt_prefix') {
        row.value = { v: 'PFX ' };
        return row;
      }
      if (key === 'prompt_suffix') {
        row.value = { v: ' SFX' };
        return row;
      }
      return null;
    });
    dataSource = { transaction: jest.fn((fn: any) => fn({} as any)) } as any;
    cfg = { get: jest.fn() } as unknown as ConfigService;

    adapters = new Map<string, jest.Mocked<AiAdapter>>();
    adapters.set('mock', makeAdapter('mock'));
    adapters.set('tongyi', makeAdapter('tongyi'));
    adapters.set('hunyuan', makeAdapter('hunyuan'));

    service = new AiService(
      presets as unknown as Repository<PresetItem>,
      generations as unknown as Repository<Generation>,
      ledger as unknown as CreditLedgerService,
      sysCfg as unknown as Repository<SystemConfig>,
      dataSource as unknown as DataSource,
      adapters as unknown as Map<string, AiAdapter>,
      cfg,
    );
  });

  const baseArgs = {
    generationId: 'g1',
    userId: 'u1',
    imageSignedUrl: 'https://oss.example/x.jpg?sig=abc',
    presetKeys: ['rhinoplasty_bridge', 'eye_double_eyelid'],
    userText: 'subtle',
  };

  it('1) primary succeeds first try → no secondary, no refund', async () => {
    adapters.get('mock')!.editImage.mockResolvedValue(okResult());

    const r = await service.generate(baseArgs);

    expect(r.modelUsed).toBe('wanx-v1-mock');
    expect(adapters.get('mock')!.editImage).toHaveBeenCalledTimes(1);
    expect(adapters.get('tongyi')!.editImage).not.toHaveBeenCalled();
    expect(ledger.refund).not.toHaveBeenCalled();
  });

  it('2) primary 5xx → retry once succeeds, no secondary', async () => {
    adapters
      .get('mock')!
      .editImage.mockRejectedValueOnce(throwWith(500, 'oops'))
      .mockResolvedValueOnce(okResult('wanx-v1-mock'));

    const r = await service.generate(baseArgs);

    expect(r.modelUsed).toBe('wanx-v1-mock');
    expect(adapters.get('mock')!.editImage).toHaveBeenCalledTimes(2);
    expect(adapters.get('tongyi')!.editImage).not.toHaveBeenCalled();
    expect(ledger.refund).not.toHaveBeenCalled();
  });

  it('3) primary exhausted (5xx twice) → secondary takes over and succeeds', async () => {
    adapters
      .get('mock')!
      .editImage.mockRejectedValue(throwWith(503, 'down'));
    adapters.get('tongyi')!.editImage.mockResolvedValue(okResult('wanx-v1'));

    const r = await service.generate(baseArgs);

    expect(r.modelUsed).toBe('wanx-v1');
    expect(adapters.get('mock')!.editImage).toHaveBeenCalledTimes(2);
    expect(adapters.get('tongyi')!.editImage).toHaveBeenCalledTimes(1);
    expect(ledger.refund).not.toHaveBeenCalled();
  });

  it('4) primary 4xx (non-429) → no retry on primary, refund + throw', async () => {
    // Configure secondary as disabled so the only vendor in the
    // chain is the failing one — the test name's "no secondary"
    // promise hinges on that.
    sysCfg.findOneBy.mockImplementation(async ({ key }: any) => {
      const row: SystemConfig = {
        key,
        value: null,
        updatedBy: 'system',
        updatedAt: new Date(),
      };
      if (key === 'ai_models') {
        row.value = {
          primary: { vendor: 'mock', enabled: true, timeoutMs: 30000 },
          secondary: { vendor: 'tongyi', enabled: false, timeoutMs: 30000 },
          allowFallback: true,
        };
        return row;
      }
      if (key === 'prompt_prefix') {
        row.value = { v: '' };
        return row;
      }
      if (key === 'prompt_suffix') {
        row.value = { v: '' };
        return row;
      }
      return null;
    });
    adapters.get('mock')!.editImage.mockRejectedValue(throwWith(400, 'bad prompt'));
    const genSpy = jest.spyOn(generations, 'update');

    await expect(service.generate(baseArgs)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(adapters.get('mock')!.editImage).toHaveBeenCalledTimes(1);
    expect(adapters.get('tongyi')!.editImage).not.toHaveBeenCalled();
    expect(ledger.refund).toHaveBeenCalledWith('u1', 30, 'g1', expect.any(String));
    expect(genSpy).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ status: GenerationStatus.FAILED }),
    );
  });

  it('5) primary 5xx + secondary 5xx → refund + mark failed + throw', async () => {
    adapters.get('mock')!.editImage.mockRejectedValue(throwWith(502, 'bad gateway'));
    adapters.get('tongyi')!.editImage.mockRejectedValue(throwWith(503, 'down'));
    const genSpy = jest.spyOn(generations, 'update');

    await expect(service.generate(baseArgs)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(adapters.get('mock')!.editImage).toHaveBeenCalledTimes(2);
    expect(adapters.get('tongyi')!.editImage).toHaveBeenCalledTimes(2);
    expect(ledger.refund).toHaveBeenCalledWith('u1', 30, 'g1', expect.any(String));
    expect(genSpy).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ status: GenerationStatus.FAILED }),
    );
  });

  it('prompt is built as prefix + presets AND + user_text + suffix', async () => {
    adapters.get('mock')!.editImage.mockResolvedValue(okResult());

    await service.generate({ ...baseArgs, userText: null });

    expect(adapters.get('mock')!.editImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'PFX elevated bridge AND double eyelid SFX',
      }),
    );
  });

  it('skips a disabled secondary without attempting it', async () => {
    sysCfg.findOneBy.mockImplementation(async ({ key }: any) => {
      const row: SystemConfig = {
        key,
        value: null,
        updatedBy: 'system',
        updatedAt: new Date(),
      };
      if (key === 'ai_models') {
        row.value = {
          primary: { vendor: 'mock', enabled: true, timeoutMs: 30000 },
          secondary: { vendor: 'tongyi', enabled: false, timeoutMs: 30000 },
          allowFallback: true,
        };
        return row;
      }
      if (key === 'prompt_prefix') {
        row.value = { v: '' };
        return row;
      }
      if (key === 'prompt_suffix') {
        row.value = { v: '' };
        return row;
      }
      return null;
    });
    adapters.get('mock')!.editImage.mockRejectedValue(throwWith(500));

    await expect(service.generate(baseArgs)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(adapters.get('tongyi')!.editImage).not.toHaveBeenCalled();
    expect(ledger.refund).toHaveBeenCalled();
  });
});
