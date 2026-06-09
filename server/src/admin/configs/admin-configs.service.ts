import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from '../../entities/system-config.entity';
import { AuditService } from '../../audit/audit.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

export interface ConfigsListResult {
  items: SystemConfig[];
  total: number;
}

/**
 * Back-office system-config editor. Each config is a singleton
 * (key, value, updatedAt). The `value` column is JSONB so the
 * shape can evolve per key without a schema change.
 *
 * The hard-coded key allowlist guards against accidental writes
 * to keys the runtime depends on but admins shouldn't hand-edit
 * (e.g. `secret_keys`). Admins can add new keys; existing keys
 * can be edited; deletions are explicitly NOT supported (set
 * `value=null` in the row instead, so the runtime still finds
 * a row when the lookup misses).
 */
const ALLOWED_KEYS = new Set<string>([
  'rate_limit',
  'ai_models',
  'credit_pricing_table',
  'ai_prompt_prefix',
  'ai_prompt_suffix',
  'notification_templates',
  'refund_policy',
]);

@Injectable()
export class AdminConfigsService {
  constructor(
    @InjectRepository(SystemConfig) private readonly repo: Repository<SystemConfig>,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ConfigsListResult> {
    const [items, total] = await this.repo.findAndCount({
      order: { key: 'ASC' },
    });
    return { items, total };
  }

  async upsert(
    key: string,
    value: unknown,
    operator: JwtPayload,
  ): Promise<SystemConfig> {
    if (!ALLOWED_KEYS.has(key)) {
      throw new NotFoundException(`config key 不允许编辑: ${key}`);
    }
    const existing = await this.repo.findOne({ where: { key } });
    const previous = existing ? { ...existing } : null;

    if (existing) {
      existing.value = value;
      existing.updatedBy = operator.id;
      const saved = await this.repo.save(existing);
      await this.audit.write({
        adminId: operator.id,
        action: 'config.update',
        targetType: 'config',
        targetId: key,
        payload: { previous: previous?.value, next: value },
      });
      return saved;
    }

    const created = this.repo.create({
      key,
      value,
      updatedBy: operator.id,
    });
    const saved = await this.repo.save(created);
    await this.audit.write({
      adminId: operator.id,
      action: 'config.create',
      targetType: 'config',
      targetId: key,
      payload: { next: value },
    });
    return saved;
  }
}
