import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { CreditPackage } from '../../entities/credit-package.entity';

export interface AdminOrderListQuery {
  page?: number;
  pageSize?: number;
  status?: OrderStatus | 'all';
  /** Free-text match on order_no OR on the user's phone hash (admin can't see phone directly). */
  q?: string;
  /** ISO date (inclusive). */
  fromDate?: string;
  /** ISO date (inclusive). */
  toDate?: string;
}

export interface AdminOrderListResult {
  items: Array<
    Order & {
      userNickname: string | null;
      userPhoneMask: string | null;
      packageName: string;
    }
  >;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Back-office view of `orders`. Admin gets a joined, denormalized list
 * (user nickname, masked phone, package name) so the table can render
 * without per-row fetches. Read-only in this module — refunds/refund
 * approvals live under `admin/refunds/` (Task 34).
 */
@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async list(query: AdminOrderListQuery = {}): Promise<AdminOrderListResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoinAndMapOne('o.user', User, 'u', 'u.id = o.user_id')
      .leftJoinAndMapOne('o.package', CreditPackage, 'p', 'p.id = o.package_id')
      .orderBy('o.created_at', 'DESC');

    if (query.status && query.status !== ('all' as OrderStatus)) {
      qb.andWhere('o.status = :st', { st: query.status });
    }
    if (query.q) {
      const term = `%${query.q}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('o.order_no ILIKE :t', { t: term })
            .orWhere('u.nickname ILIKE :t', { t: term })
            .orWhere('u.phone_hash ILIKE :t', { t: term });
        }),
      );
    }
    if (query.fromDate) {
      qb.andWhere('o.created_at >= :from', { from: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('o.created_at <= :to', { to: query.toDate });
    }

    qb.skip((page - 1) * pageSize).take(pageSize);

    const [rawItems, total] = await qb.getManyAndCount();

    const items = rawItems.map((row) => {
      // `user` / `package` come back as raw joins on the same row
      // because we used leftJoinAndMapOne. We project them onto the
      // flat DTO and leave the originals in for any future use.
      const flatRow = row as unknown as Order & {
        user: User | null;
        package: CreditPackage | null;
      };
      return {
        ...flatRow,
        userNickname: flatRow.user?.nickname ?? null,
        // We don't have the plaintext phone, but the SHA-256 hash
        // tail gives a stable, non-reversible 4-char "fingerprint" so
        // an operator can verify a customer call without exposing PII.
        userPhoneMask: flatRow.user?.phoneHash
          ? `****${flatRow.user.phoneHash.slice(-4)}`
          : null,
        packageName: flatRow.package?.name ?? '—',
      };
    });

    return { items, total, page, pageSize };
  }

  async detail(id: string): Promise<Order & { user: User | null; package: CreditPackage | null }> {
    const order = await this.orders
      .createQueryBuilder('o')
      .leftJoinAndMapOne('o.user', User, 'u', 'u.id = o.user_id')
      .leftJoinAndMapOne('o.package', CreditPackage, 'p', 'p.id = o.package_id')
      .where('o.id = :id', { id })
      .getOne();
    if (!order) throw new NotFoundException('订单不存在');
    return order as unknown as Order & { user: User | null; package: CreditPackage | null };
  }
}
