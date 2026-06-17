import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AiAdapter, AiEditResult } from './adapters/ai-adapter.interface';
import { buildPrompt, SYSTEM_PROMPT_PREFIX, SYSTEM_PROMPT_SUFFIX } from './prompt';
import { CreditLedgerService } from '../credit/creditledger.service';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { PresetItem } from '../entities/preset-item.entity';
import { SystemConfig } from '../entities/system-config.entity';

export interface GenerateInput {
  generationId: string;
  userId: string;
  imageSignedUrl: string;
  presetKeys: string[];
  userText: string | null;
}

interface VendorTarget {
  vendor: 'mock' | 'tongyi' | 'hunyuan';
  enabled: boolean;
  timeoutMs: number;
}

interface AiModelsConfig {
  primary: VendorTarget;
  secondary: VendorTarget;
  allowFallback: boolean;
}

interface AttemptError {
  vendor: string;
  attempt: number;
  status?: number;
  message: string;
}

/**
 * AIService — the vendor-routing brain that sits between the Bull
 * worker (Task 25) and the individual adapters (Task 22 + 23).
 *
 * The full happy path:
 *   1. Read `ai_models` and prompt affixes from `system_configs`.
 *   2. Resolve the user's preset `key`s to their `defaultPrompt`
 *      strings, then compose the final prompt via `buildPrompt()`
 *      (Task 21).
 *   3. Try `primary` (1 retry on 5xx / 429). On 4xx (non-429) we
 *      stop immediately — bad input will be bad on every vendor.
 *   4. If `primary` is exhausted and `secondary.enabled`, try it
 *      with the same retry policy.
 *   5. If all targets are exhausted, refund the credits already
 *      debited at submit time (Task 25) and mark the generation
 *      `failed` with the error trail. Throw 500 so the Bull job
 *      is marked failed (we already cleaned up state).
 *
 * The "5xx retries, 4xx no retry" rule mirrors what HTTP-aware
 * middleware does: 4xx means the request itself is bad, retrying
 * will fail identically. 429 + 5xx mean "server overloaded" and
 * benefit from a quick retry.
 */
export const AI_ADAPTERS = 'AI_ADAPTERS';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(PresetItem)
    private readonly presets: Repository<PresetItem>,
    @InjectRepository(Generation)
    private readonly generations: Repository<Generation>,
    private readonly ledger: CreditLedgerService,
    @InjectRepository(SystemConfig)
    private readonly sysCfg: Repository<SystemConfig>,
    private readonly dataSource: DataSource,
    @Inject(AI_ADAPTERS) private readonly adapters: Map<string, AiAdapter>,
    private readonly cfg: ConfigService,
  ) {}

  async generate(input: GenerateInput): Promise<AiEditResult> {
    const modelsCfg = await this.loadAiModels();
    const { prefix: dbPrefix, suffix: dbSuffix } = await this.loadPromptAffixes();
    // Use structured system prompt by default; fall back to DB config if customised
    const prefix = dbPrefix || SYSTEM_PROMPT_PREFIX;
    const suffix = dbSuffix || SYSTEM_PROMPT_SUFFIX;
    const { prompts: presetPrompts, names: presetNames } = await this.resolvePresetPrompts(input.presetKeys);
    const prompt = buildPrompt(prefix, presetPrompts, input.userText, suffix);
    let safeImage = input.imageSignedUrl;
    try {
      const u = new URL(input.imageSignedUrl);
      safeImage = `${u.host}${u.pathname}`;
    } catch {
      safeImage = '<unparseable imageSignedUrl>';
    }
    this.logger.log(
      `[ai] generation=${input.generationId} presets=${JSON.stringify(input.presetKeys)} presetNames=${JSON.stringify(presetNames)} userText=${JSON.stringify(input.userText ?? '')} image=${safeImage} prompt=${JSON.stringify(prompt)}`,
    );

    const errors: AttemptError[] = [];
    for (const target of [modelsCfg.primary, modelsCfg.secondary]) {
      if (!target?.enabled) continue;
      const adapter = this.adapters.get(target.vendor);
      if (!adapter) {
        this.logger.warn(
          `[ai] vendor ${target.vendor} configured but no adapter registered`,
        );
        continue;
      }
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await adapter.editImage({
            imageSignedUrl: input.imageSignedUrl,
            prompt,
          });
        } catch (e: any) {
          const status: number | undefined = e?.status ?? e?.response?.status;
          const message = e?.message ?? String(e);
          errors.push({
            vendor: target.vendor,
            attempt,
            status,
            message,
          });
          this.logger.warn(
            `[ai] ${target.vendor} attempt ${attempt} failed (status=${status}): ${message}`,
          );
          if (
            status !== undefined &&
            status >= 400 &&
            status < 500 &&
            status !== 429
          ) {
            break; // Bad input — don't burn the retry budget.
          }
        }
      }
    }

    return this.failAndRefund(input, errors);
  }

  // ── helpers ───────────────────────────────────────────────────────

  private async loadAiModels(): Promise<AiModelsConfig> {
    const row = await this.sysCfg.findOneBy({ key: 'ai_models' });
    return (row?.value as AiModelsConfig) ?? {
      primary: { vendor: 'mock', enabled: true, timeoutMs: 30000 },
      secondary: { vendor: 'tongyi', enabled: false, timeoutMs: 30000 },
      allowFallback: true,
    };
  }

  private async loadPromptAffixes(): Promise<{
    prefix: string;
    suffix: string;
  }> {
    const [p, s] = await Promise.all([
      this.sysCfg.findOneBy({ key: 'prompt_prefix' }),
      this.sysCfg.findOneBy({ key: 'prompt_suffix' }),
    ]);
    return {
      prefix: String((p?.value as any)?.v ?? ''),
      suffix: String((s?.value as any)?.v ?? ''),
    };
  }

  private async resolvePresetPrompts(keys: string[]): Promise<{
    prompts: string[];
    names: string[];
  }> {
    if (keys.length === 0) return { prompts: [], names: [] };
    const rows = await this.presets.findBy({ key: In(keys) });
    // Preserve the user's picked order; missing keys become a
    // no-op fragment so the prompt still composes cleanly.
    return {
      prompts: keys.map((k) => rows.find((r) => r.key === k)?.defaultPrompt ?? ''),
      names: keys.map((k) => rows.find((r) => r.key === k)?.name ?? k),
    };
  }

  private async failAndRefund(
    input: GenerateInput,
    errors: AttemptError[],
  ): Promise<AiEditResult> {
    const gen = await this.generations.findOneBy({ id: input.generationId });
    const cost = gen?.creditsCost ?? 0;
    if (cost > 0) {
      try {
        await this.ledger.refund(
          input.userId,
          cost,
          input.generationId,
          `AI 全部失败: ${JSON.stringify(errors)}`,
        );
      } catch (e: any) {
        this.logger.error(
          `[ai] refund failed for generation ${input.generationId}: ${e?.message ?? e}`,
        );
      }
    }
    await this.generations.update(input.generationId, {
      status: GenerationStatus.FAILED,
      resultUrl: null,
      modelUsed: errors.map((e) => e.vendor).join(',') || null,
    });
    throw new InternalServerErrorException({
      code: 'AI_FAILED',
      message: 'All configured AI vendors failed',
      errors,
    });
  }
}
