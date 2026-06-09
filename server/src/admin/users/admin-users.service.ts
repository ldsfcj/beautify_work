import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { User, UserStatus } from '../../entities/user.entity';
import { CreditLedgerService } from '../../credit/creditledger.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

export interface AdminUserListQuery {
  page?: number;
  pageSize?: number;
  status?: UserStatus | 'all';
  q?: string;
}

export interface AdminUserListResult {
  items: Array<User & { phoneMask: string | null }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminAdjustCreditsDto {
  /** Positive to add, negative to subtract. The endpoint validates bounds server-side. */
  amount: number;
  reason: string;
}

/**
 * Back-office user management. Read paths (list, detail, search)
 * are unrestricted to any admin role; the credit-adjustment path
 * logs the operator id into the ledger's `relatedId` so a finance
 * audit can answer "who changed this user's balance on date X?".
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly credits: CreditLedgerService,
  ) {}

  async list(query: AdminUserListQuery = {}): Promise<AdminUserListResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const qb = this.users.createQueryBuilder('u').orderBy('u.created_at', 'DESC');

    if (query.status && query.status !== ('all' as UserStatus)) {
      qb.andWhere('u.status = :st', { st: query.status });
    }
    if (query.q) {
      const term = `%${query.q}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('u.nickname ILIKE :t', { t: term })
            .orWhere('u.phone_hash ILIKE :t', { t: term });
        }),
      );
    }

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [rawItems, total] = await qb.getManyAndCount();

    const items = rawItems.map((u) => ({
      ...u,
      phoneMask: u.phoneHash ? `****${u.phoneHash.slice(-4)}` : null,
    }));

    return { items, total, page, pageSize };
  }

  async detail(id: string): Promise<User & { phoneMask: string | null }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return {
      ...user,
      phoneMask: user.phoneHash ? `****${user.phoneHash.slice(-4)}` : null,
    };
  }

  /**
   * Manually adjust a user's credit balance. Positive `amount` goes
   * through `recharge` (a normal ledger write); negative is rejected
   * here — we use the `refund` flow (Task 34) for any subtraction
   * because refunds have stricter audit semantics.
   */
  async adjustCredits(
    targetUserId: string,
    dto: AdminAdjustCreditsDto,
    operator: JwtPayload,
  ): Promise<{ balanceAfter: number; ledgerId: string }> {
    if (dto.amount <= 0) {
      throw new NotFoundException('amount 必须为正数；如需扣减请走退款流程');
    }
    const user = await this.users.findOne({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('用户不存在');

    const relatedId = `admin-adjust:${operator.id}:${Date.now()}:${dto.reason.slice(0, 32)}`;
    const { balanceAfter } = await this.credits.recharge(targetUserId, dto.amount, relatedId);
    return {
      balanceAfter,
      // ledgerId is the relatedId we just used; we expose it for the
      // admin UI to jump to the audit log entry once Task 34 ships.
      ledgerId: relatedId,
    };
  }
}
