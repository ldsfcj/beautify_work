import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { Not, type Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import { CreditLedgerService } from '../credit/creditledger.service';
import { LedgerType } from '../entities/credit-ledger.entity';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { DownloadLog } from '../entities/download-log.entity';
import { Generation, GenerationStatus } from '../entities/generation.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { NotificationService } from '../notification/notification.service';
import { OssService } from '../oss/oss.service';
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

export interface StatusResult {
  id: string;
  status: GenerationStatus;
  result_url: string | null;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  /** Optional filter — `'deleted'` is never returned by default. */
  status?: GenerationStatus | 'all';
}

export interface ListResult {
  items: Generation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DetailResult {
  generation: Generation;
  /** Last 5 AI call log rows for this generation, newest first. */
  ai_logs: AiCallLog[];
}

export interface DownloadUrlResult {
  url: string;
  expires_in: number;
}

interface CreditPricingTable {
  [presetCount: string]: number;
}

/**
 * OSS key the client submits in `image_url` must look like
 * `uploads/{userId}/<file>.<ext>`. The pattern keeps the key
 * shape predictable; the actual authorization gate is the
 * userId equality check below — a caller can never submit a
 * key whose userId segment doesn't match their own principal.
 */
const OSS_KEY_PATTERN = /^uploads\/([0-9a-zA-Z-]+)\/[\w-]+\.[a-z0-9]+$/;

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
    @InjectRepository(AiCallLog)
    private readonly aiLogs: Repository<AiCallLog>,
    @InjectRepository(DownloadLog)
    private readonly downloads: Repository<DownloadLog>,
    @Inject(AI_GENERATE_QUEUE)
    private readonly queue: Queue,
    private readonly ledger: CreditLedgerService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly notif: NotificationService,
    private readonly oss: OssService,
  ) {}

  async submit(userId: string, dto: SubmitDto): Promise<SubmitResult> {
    if (!dto.preset_keys || dto.preset_keys.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_PRESETS',
        message: 'preset_keys 不能为空',
      });
    }

    // image_url is now an OSS key produced by the presigned-upload
    // flow (NOT a base64 data URL — those blow the 100kb JSON
    // limit and yield 413s on real photos). The key must be
    // user-scoped: a caller can never submit another user's key
    // or a result-image key.
    if (!OSS_KEY_PATTERN.test(dto.image_url)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_KEY',
        message: 'image_url 必须是 uploads/{userId}/<file>.<ext> 格式的 OSS key',
      });
    }
    const keyUser = dto.image_url.split('/')[1];
    if (keyUser !== userId) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_KEY',
        message: 'image_url 的 userId 与当前用户不匹配',
      });
    }

    // Verify the file actually exists in OSS. Without this check a
    // client could construct a well-formed key but skip the upload,
    // causing the worker to fail when it tries to sign and fetch
    // the image.
    const keyExists = await this.oss.exists(dto.image_url);
    if (!keyExists) {
      throw new BadRequestException({
        code: 'IMAGE_NOT_UPLOADED',
        message: '图片尚未上传，请先完成上传',
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

  // ── read-side helpers (Task 26) ────────────────────────────────────

  /**
   * Lightweight status probe for the result page's polling loop.
   * Returns only the fields the client needs to decide between
   * "keep polling" and "render the image" — keeping the payload
   * small enough to fetch on a 1s interval without burning the
   * mobile data plan.
   */
  async status(userId: string, id: string): Promise<StatusResult> {
    const g = await this.findOwnedOrThrow(userId, id);
    return {
      id: g.id,
      status: g.status,
      result_url: g.status === GenerationStatus.SUCCESS ? g.resultUrl : null,
    };
  }

  /**
   * Paginated history list for the history page. `deleted` rows
   * are always excluded from the default view (a soft-delete is
   * effectively a hide, not a purge — the row stays in the DB for
   * audit; the user just can't see it in their list).
   */
  async list(userId: string, opts: ListOptions = {}): Promise<ListResult> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));

    const where: Record<string, unknown> = { userId };
    if (opts.status && opts.status !== 'all' && opts.status !== GenerationStatus.DELETED) {
      where.status = opts.status;
    } else {
      // Default: hide soft-deleted rows so they don't pollute the
      // history list. Callers can still pass status='deleted' to
      // view the trash (not exposed in the current API surface).
      where.status = Not(GenerationStatus.DELETED);
    }

    const [items, total] = await this.gens.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }

  /**
   * Full detail view for the result page. Bundles the last 5
   * AI call logs so the user can see the vendor + latency when
   * the model degrades (handy for "why does it look weird?"
   * support tickets).
   */
  async detail(userId: string, id: string): Promise<DetailResult> {
    const generation = await this.findOwnedOrThrow(userId, id);
    const ai_logs = await this.aiLogs.find({
      where: { generationId: id },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    return { generation, ai_logs };
  }

  /**
   * Soft-delete: flip `status` to `deleted` rather than removing
   * the row. The row stays for compliance / data-subject
   * requests and a future admin "trash bin" view. Idempotent —
   * a re-delete is a no-op.
   */
  async softDelete(userId: string, id: string): Promise<void> {
    const g = await this.findOwnedOrThrow(userId, id);
    if (g.status === GenerationStatus.DELETED) return;
    await this.gens.update({ id, userId }, { status: GenerationStatus.DELETED });
  }

  /**
   * Issue a 5-minute signed OSS URL for the result image and
   * audit-log the download. The TTL is the standard 5 min: long
   * enough to start a download on a slow connection, short
   * enough that a leaked link expires before the user notices.
   *
   * `download_logs` is a compliance requirement (D6) — every
   * download must be attributable to a user, an IP, and a UA.
   * The IP/UA fields are filled by the controller from the
   * request, but if the caller doesn't provide them we
   * default to `0.0.0.0` / `unknown` so the row is still
   * insertable.
   */
  async downloadUrl(
    userId: string,
    id: string,
    ip = '0.0.0.0',
    ua = 'unknown',
  ): Promise<DownloadUrlResult> {
    const g = await this.findOwnedOrThrow(userId, id);
    if (g.status !== GenerationStatus.SUCCESS || !g.resultUrl) {
      throw new BadRequestException({
        code: 'NOT_READY',
        message: '生成未成功，无法下载',
      });
    }
    const expiresInSec = 300;
    const url = await this.oss.signedUrl(g.resultUrl, expiresInSec);
    await this.downloads.save(
      this.downloads.create({
        userId,
        generationId: id,
        ip,
        ua,
      }),
    );
    return { url, expires_in: expiresInSec };
  }

  // ── private helpers ────────────────────────────────────────────────

  private async findOwnedOrThrow(userId: string, id: string): Promise<Generation> {
    const g = await this.gens.findOne({ where: { id, userId } });
    if (!g) {
      // Foreign id → 404 (never 403) so we don't leak the
      // existence of other users' generation rows.
      throw new NotFoundException('生成记录不存在');
    }
    return g;
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
