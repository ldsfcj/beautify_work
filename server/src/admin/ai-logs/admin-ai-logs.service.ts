import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCallLog } from '../../entities/ai-call-log.entity';

export interface AiLogsListQuery {
  page?: number;
  pageSize?: number;
  model?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AiLogsListResult {
  items: AiCallLog[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Back-office read-only view of `ai_call_logs`. Used for cost
 * monitoring (sum costCents by model/day) and incident forensics
 * (latency + error correlation when the model degrades).
 */
@Injectable()
export class AdminAiLogsService {
  constructor(
    @InjectRepository(AiCallLog) private readonly repo: Repository<AiCallLog>,
  ) {}

  async list(query: AiLogsListQuery = {}): Promise<AiLogsListResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));

    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC');

    if (query.model) qb.andWhere('a.model = :m', { m: query.model });
    if (query.fromDate) qb.andWhere('a.createdAt >= :from', { from: query.fromDate });
    if (query.toDate) qb.andWhere('a.createdAt <= :to', { to: query.toDate });

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }
}
