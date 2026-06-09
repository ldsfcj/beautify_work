import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

export interface WriteAuditInput {
  adminId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface AuditListQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  adminId?: string;
  targetId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AuditListResult {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Back-office audit log. `write()` is fire-and-forget from the
 * caller's perspective: a failure to persist the audit row is
 * logged but never bubbles up — the user-visible action
 * (e.g. credit adjust) must not fail because the audit log is
 * momentarily unavailable. We trade a small loss of audit fidelity
 * for a stronger guarantee on the primary action.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  async write(input: WriteAuditInput): Promise<void> {
    try {
      const row = this.repo.create({
        adminId: input.adminId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        payload: input.payload ?? null,
      });
      await this.repo.save(row);
    } catch (e) {
      this.logger.error(
        `audit write failed action=${input.action} admin=${input.adminId} target=${input.targetId ?? '-'}: ${
          (e as Error)?.message ?? e
        }`,
      );
    }
  }

  async list(query: AuditListQuery = {}): Promise<AuditListResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));

    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC');

    if (query.action) qb.andWhere('a.action = :a', { a: query.action });
    if (query.adminId) qb.andWhere('a.admin_id = :aid', { aid: query.adminId });
    if (query.targetId) qb.andWhere('a.target_id = :tid', { tid: query.targetId });
    if (query.fromDate) qb.andWhere('a.created_at >= :from', { from: query.fromDate });
    if (query.toDate) qb.andWhere('a.created_at <= :to', { to: query.toDate });

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }
}
