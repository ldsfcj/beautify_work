import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Not, Repository } from 'typeorm';
import { User, UserStatus } from '../../entities/user.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Generation, GenerationStatus } from '../../entities/generation.entity';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { AiCallLog } from '../../entities/ai-call-log.entity';

export interface DashboardSummary {
  users: {
    total: number;
    active: number;
    pendingDelete: number;
    newThisWeek: number;
  };
  orders: {
    total: number;
    paid: number;
    pending: number;
    revenueCentsThisWeek: number;
  };
  generations: {
    total: number;
    success: number;
    failed: number;
    successRate7d: number;
  };
  refunds: {
    pending: number;
    approved: number;
  };
  ai: {
    calls7d: number;
    costCents7d: number;
    avgLatencyMs7d: number;
  };
}

/**
 * Back-office dashboard aggregates. Every number is a single SQL
 * count/sum (no full table scans in Node) so the page is cheap even
 * with millions of generations.
 *
 * The 7-day window uses `now - 7d` against `created_at`; SQL timezone
 * follows the server's PG `TimeZone` (UTC by default).
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Generation) private readonly gens: Repository<Generation>,
    @InjectRepository(Refund) private readonly refunds: Repository<Refund>,
    @InjectRepository(AiCallLog) private readonly aiCalls: Repository<AiCallLog>,
  ) {}

  async summary(): Promise<DashboardSummary> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      pendingDeleteUsers,
      newUsersThisWeek,
      totalOrders,
      paidOrders,
      pendingOrders,
      revenueThisWeekAgg,
      totalGens,
      successGens,
      failedGens,
      gens7dSuccess,
      gens7dFailed,
      pendingRefunds,
      approvedRefunds,
      aiCalls7d,
      aiCost7dAgg,
      aiLatency7dAgg,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ where: { status: UserStatus.ACTIVE } }),
      this.users.count({ where: { status: UserStatus.PENDING_DELETE } }),
      this.users.count({ where: { createdAt: MoreThanOrEqual(since) } }),
      this.orders.count(),
      this.orders.count({ where: { status: OrderStatus.PAID } }),
      this.orders.count({ where: { status: OrderStatus.PENDING } }),
      this.orders
        .createQueryBuilder('o')
        .select('COALESCE(SUM(o.amount_cents), 0)', 'sum')
        .where('o.status = :s', { s: OrderStatus.PAID })
        .andWhere('o.paid_at >= :since', { since })
        .getRawOne<{ sum: string }>(),
      this.gens.count({ where: { status: Not(GenerationStatus.DELETED) } }),
      this.gens.count({ where: { status: GenerationStatus.SUCCESS } }),
      this.gens.count({ where: { status: GenerationStatus.FAILED } }),
      this.gens.count({
        where: { status: GenerationStatus.SUCCESS, createdAt: MoreThanOrEqual(since) },
      }),
      this.gens.count({
        where: { status: GenerationStatus.FAILED, createdAt: MoreThanOrEqual(since) },
      }),
      this.refunds.count({ where: { status: RefundStatus.PENDING } }),
      this.refunds.count({ where: { status: RefundStatus.APPROVED } }),
      this.aiCalls.count({ where: { createdAt: MoreThanOrEqual(since) } }),
      this.aiCalls
        .createQueryBuilder('a')
        .select('COALESCE(SUM(a.cost_cents), 0)', 'sum')
        .where('a.created_at >= :since', { since })
        .getRawOne<{ sum: string }>(),
      this.aiCalls
        .createQueryBuilder('a')
        .select('COALESCE(AVG(a.latency_ms), 0)', 'avg')
        .where('a.created_at >= :since', { since })
        .getRawOne<{ avg: string }>(),
    ]);

    const total7d = Number(gens7dSuccess) + Number(gens7dFailed);
    const successRate7d =
      total7d === 0 ? 0 : Math.round((Number(gens7dSuccess) / total7d) * 1000) / 10;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        pendingDelete: pendingDeleteUsers,
        newThisWeek: newUsersThisWeek,
      },
      orders: {
        total: totalOrders,
        paid: paidOrders,
        pending: pendingOrders,
        revenueCentsThisWeek: Number(revenueThisWeekAgg?.sum ?? 0),
      },
      generations: {
        total: totalGens,
        success: successGens,
        failed: failedGens,
        successRate7d,
      },
      refunds: {
        pending: pendingRefunds,
        approved: approvedRefunds,
      },
      ai: {
        calls7d: aiCalls7d,
        costCents7d: Number(aiCost7dAgg?.sum ?? 0),
        avgLatencyMs7d: Math.round(Number(aiLatency7dAgg?.avg ?? 0)),
      },
    };
  }
}
