import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import { CreditLedgerService } from '../credit/creditledger.service';
import { LedgerType } from '../entities/credit-ledger.entity';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { NotificationService } from '../notification/notification.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  DEFAULT_RATE_LIMIT,
  RateLimitConfig,
  checkAiRateLimit,
} from '../ai/rate-limiter';

/** Queue token — `BULL_QUEUE_AI_GENERATE` mirrors the @Processor('ai.generate') name on the worker side. */
export const AI_GENERATE_QUEUE = 'BULL_QUEUE_AI_GENERATE';

export interface SubmitDto {
  image_url: string;
  preset_keys: string[];
  /** Optional consultant note appended to the prompt. */
  text?: string;
}

export interface SubmitResult {
  generation_id: string;
  balance_after: number;
}

interface CreditPricingTable {
  [presetCount: string]: number;
}

/**
 * Default cost ladder. The 5-credit cap mirrors the runbook (Task 25):
 *   1 preset  → 2 credits
 *   2 presets → 3
 *   3 presets → 4
 *   4+ presets → 5 (cap; encourages bundling but prevents arithmetic explosion)
 *
 * Admins can override the ladder at runtime via
 * `system_configs.credit_pricing_table`, a JSONB map keyed by
 * preset count (`{1:2,2:3,3:4,4:5}`). Anything not in the table
 * falls through to the next-lower entry, capped at 5.
 */
const DEFAULT_PRICING: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
];

/**
 * GenerateService is the 50ms submit hot path. Three things happen
 * inside the request handler:
 *
 *   1. Rate-limit check (Redis Lua, three windows — see rate-limiter.ts)
 *   2. Credit debit via CreditLedgerService (its own transaction
 *      wraps the user-row lock + ledger insert)
 *   3. Generation row insert + Bull enqueue
 *
 * (2) and (3) are deliberately two separate transactions. The
 * alternative — a single transaction covering both — would block
 * the response on the second round-trip, blowing the 50ms budget.
 * The compromise: a crash between (2) and (3) leaves a "ghost"
 * debit on the user's balance, which a periodic reconciliation
 * job (Task 35 monitoring) can sweep up by matching
 * `credit_ledger.type=consume` rows with no corresponding
 * `generations` row within 5 minutes.
 */
@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    @InjectRepository(Generation)
    private readonly gens: Repository<Generation>,
    @InjectRepository(SystemConfig)
    private readonly sysCfg: Repository<SystemConfig>,
    @Inject(AI_GENERATE_QUEUE)
    private readonly queue: Queue,
    private readonly ledger: CreditLedgerService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly notif: NotificationService,
  ) {}

  async submit(userId: string, dto: SubmitDto): Promise<SubmitResult> {
    if (!dto.preset_keys || dto.preset_keys.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_PRESETS',
        message: 'preset_keys 不能为空',
      });
    }

    // 1. Rate limit (atomic three-window check). Throws 429 if tripped.
    const rl = await this.loadRateLimit();
    await checkAiRateLimit(this.redis, userId, rl);

    // 2. Cost lookup
    const cost = await this.calcCost(dto.preset_keys.length);

    // 3. Debit credits first. Throws 402 INSUFFICIENT_CREDITS if
    // balance is too low. The relatedId here is `null` because
    // we don't have a generation row yet; the consume ledger
    // entry will be re-keyed once the row exists (a tiny audit
    // wart, but it keeps the user-row lock window short).
    const debit = await this.ledger.consume(userId, cost, LedgerType.CONSUME, 'submit');

    // 4. Create the pending generation row. If THIS fails, we
    // must refund the debit or the user loses credits for a
    // job that never enters the queue.
    let generation: Generation;
    try {
      generation = await this.createPendingGeneration(userId, dto, cost);
    } catch (e: any) {
      await this.refundSubmitDebit(userId, cost, (e as Error)?.message ?? 'submit failed');
      throw e;
    }

    // 5. Enqueue the worker job. If THIS fails, refund + mark
    // the row failed.
    try {
      await this.queue.add(
        'edit',
        {
          generationId: generation.id,
          userId,
          imageUrl: dto.image_url,
          presetKeys: dto.preset_keys,
          text: dto.text ?? null,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86_400 },
        },
      );
    } catch (e: any) {
      await this.refundSubmitDebit(userId, cost, (e as Error)?.message ?? 'enqueue failed');
      await this.markFailed(generation.id, (e as Error)?.message ?? 'enqueue failed');
      throw e;
    }

    return { generation_id: generation.id, balance_after: debit.balanceAfter };
  }

  private async refundSubmitDebit(
    userId: string,
    cost: number,
    reason: string,
  ): Promise<void> {
    try {
      await this.ledger.refund(userId, cost, 'submit-rollback', `submit failed: ${reason}`);
    } catch (e: any) {
      this.logger.error(
        `[generate] refund-on-failure failed for user ${userId} cost=${cost}: ${e?.message ?? e}`,
      );
    }
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async createPendingGeneration(
    userId: string,
    dto: SubmitDto,
    cost: number,
  ): Promise<Generation> {
    const entity = this.gens.create({
      userId,
      originalUrl: dto.image_url,
      presetKeys: dto.preset_keys,
      promptText: '', // worker fills this in once the prompt is composed
      creditsCost: cost,
      status: GenerationStatus.PENDING,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    });
    return this.gens.save(entity);
  }

  private async markFailed(generationId: string, message: string): Promise<void> {
    try {
      await this.gens.update(generationId, {
        status: GenerationStatus.FAILED,
        errorMsg: message,
        resultUrl: null,
      });
    } catch (e: any) {
      this.logger.error(
        `[generate] failed to mark generation ${generationId} as failed: ${e?.message ?? e}`,
      );
    }
  }

  /**
   * Resolve the cost for `n` presets. Tries the admin-configurable
   * `credit_pricing_table` first, then falls back to the built-in
   * ladder. Caps at the highest entry in the table (default: 5).
   */
  private async calcCost(n: number): Promise<number> {
    const row = await this.sysCfg.findOneBy({ key: 'credit_pricing_table' });
    if (row?.value && typeof row.value === 'object') {
      const table = row.value as CreditPricingTable;
      // Find the largest `k <= n` in the table; cap there.
      const keys = Object.keys(table)
        .map((k) => Number(k))
        .filter((k) => Number.isInteger(k) && k > 0)
        .sort((a, b) => a - b);
      const cap = keys[keys.length - 1] ?? 4;
      const applicable = keys.filter((k) => k <= Math.min(n, cap));
      const pick = applicable[applicable.length - 1] ?? keys[0];
      if (pick && table[pick] != null) {
        return table[pick];
      }
    }
    const last = DEFAULT_PRICING[DEFAULT_PRICING.length - 1];
    for (const [k, v] of DEFAULT_PRICING) {
      if (n <= k) return v;
    }
    return last[1];
  }

  private async loadRateLimit(): Promise<RateLimitConfig> {
    const row = await this.sysCfg.findOneBy({ key: 'rate_limit' });
    if (row?.value && typeof row.value === 'object') {
      return { ...DEFAULT_RATE_LIMIT, ...(row.value as Partial<RateLimitConfig>) };
    }
    return DEFAULT_RATE_LIMIT;
  }
}
