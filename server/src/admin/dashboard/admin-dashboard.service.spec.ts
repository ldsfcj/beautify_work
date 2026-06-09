import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminDashboardService } from './admin-dashboard.service';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';
import { Generation } from '../../entities/generation.entity';
import { Refund } from '../../entities/refund.entity';
import { AiCallLog } from '../../entities/ai-call-log.entity';

/**
 * Dashboard aggregate unit tests. We mock the five repositories and
 * assert that the service dispatches the right count/sum queries and
 * composes the summary shape correctly (incl. the 7-day success-rate
 * rounding rule: 0 when no rows, otherwise 1-decimal percent).
 */
describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let users: { count: jest.Mock };
  let orders: { count: jest.Mock; createQueryBuilder: jest.Mock };
  let gens: { count: jest.Mock };
  let refunds: { count: jest.Mock };
  let aiCalls: { count: jest.Mock; createQueryBuilder: jest.Mock };

  /** Tiny QueryBuilder stub for the two SUM/AVG aggregates. */
  const qb = (sum: string | number) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ sum: String(sum) }),
    };
    return chain;
  };
  const qbAvg = (avg: number) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ avg: String(avg) }),
  });

  beforeEach(async () => {
    users = { count: jest.fn() };
    orders = { count: jest.fn(), createQueryBuilder: jest.fn() };
    gens = { count: jest.fn() };
    refunds = { count: jest.fn() };
    aiCalls = { count: jest.fn(), createQueryBuilder: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Order), useValue: orders },
        { provide: getRepositoryToken(Generation), useValue: gens },
        { provide: getRepositoryToken(Refund), useValue: refunds },
        { provide: getRepositoryToken(AiCallLog), useValue: aiCalls },
      ],
    }).compile();

    service = moduleRef.get(AdminDashboardService);
  });

  it('composes the full summary from the 5 repositories', async () => {
    // users.count: total, active, pendingDelete, newThisWeek
    users.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(80) // active
      .mockResolvedValueOnce(5) // pending_delete
      .mockResolvedValueOnce(12); // newThisWeek

    // orders.count: total, paid, pending
    orders.count
      .mockResolvedValueOnce(300) // total
      .mockResolvedValueOnce(220) // paid
      .mockResolvedValueOnce(8); // pending
    orders.createQueryBuilder.mockReturnValueOnce(qb(99_00));

    // gens.count: total, success, failed, success7d, failed7d
    gens.count
      .mockResolvedValueOnce(1000) // total
      .mockResolvedValueOnce(900) // success
      .mockResolvedValueOnce(50) // failed
      .mockResolvedValueOnce(70) // success7d
      .mockResolvedValueOnce(10); // failed7d
    // 7d success rate = 70 / (70+10) = 87.5%

    // refunds.count: pending, approved
    refunds.count.mockResolvedValueOnce(3).mockResolvedValueOnce(40);

    // aiCalls: count7d, cost, latency
    aiCalls.count.mockResolvedValueOnce(80);
    aiCalls.createQueryBuilder
      .mockReturnValueOnce(qb(12_34))
      .mockReturnValueOnce(qbAvg(4567));

    const summary = await service.summary();

    expect(summary).toEqual({
      users: { total: 100, active: 80, pendingDelete: 5, newThisWeek: 12 },
      orders: { total: 300, paid: 220, pending: 8, revenueCentsThisWeek: 9900 },
      generations: { total: 1000, success: 900, failed: 50, successRate7d: 87.5 },
      refunds: { pending: 3, approved: 40 },
      ai: { calls7d: 80, costCents7d: 1234, avgLatencyMs7d: 4567 },
    });
  });

  it('returns 0% success rate when there are no generations in the last 7 days', async () => {
    users.count.mockResolvedValue(0);
    orders.count.mockResolvedValue(0);
    orders.createQueryBuilder.mockReturnValue(qb(0));
    gens.count
      .mockResolvedValueOnce(0) // total
      .mockResolvedValueOnce(0) // success all-time
      .mockResolvedValueOnce(0) // failed all-time
      .mockResolvedValueOnce(0) // success7d
      .mockResolvedValueOnce(0); // failed7d
    refunds.count.mockResolvedValue(0);
    aiCalls.count.mockResolvedValue(0);
    aiCalls.createQueryBuilder.mockReturnValueOnce(qb(0)).mockReturnValueOnce(qbAvg(0));

    const summary = await service.summary();
    expect(summary.generations.successRate7d).toBe(0);
    expect(summary.ai.avgLatencyMs7d).toBe(0);
  });
});
