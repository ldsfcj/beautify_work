import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminOrdersService } from './admin-orders.service';
import { Order, OrderStatus } from '../../entities/order.entity';

/**
 * AdminOrdersService unit tests. The QueryBuilder is mocked as a single
 * chainable object — we assert on the final `getManyAndCount` /
 * `getOne` return values, not on intermediate SQL. Pagination bounds
 * (1 ≤ page, 1 ≤ pageSize ≤ 100) are the behaviour the runbook cares
 * about; SQL injection guards come from class-validator at the
 * controller boundary (the spec for those lives in e2e, not here).
 */
describe('AdminOrdersService', () => {
  let service: AdminOrdersService;
  let qb: {
    leftJoinAndMapOne: jest.Mock;
    orderBy: jest.Mock;
    andWhere: jest.Mock;
    where: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
    getOne: jest.Mock;
  };
  let orders: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    qb = {
      leftJoinAndMapOne: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      getOne: jest.fn(),
    };
    orders = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: getRepositoryToken(Order), useValue: orders },
      ],
    }).compile();

    service = moduleRef.get(AdminOrdersService);
  });

  describe('list', () => {
    it('clamps page to >= 1 and pageSize to 1..100', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.list({ page: -3, pageSize: 9999 });
      expect(qb.skip).toHaveBeenCalledWith(0); // page clamped to 1
      expect(qb.take).toHaveBeenCalledWith(100); // pageSize clamped to 100
    });

    it('applies status + free-text + date-range filters', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.list({
        status: OrderStatus.PAID,
        q: 'abc',
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        page: 2,
        pageSize: 10,
      });
      // status, q (one of the bracket calls), fromDate, toDate → 4 andWhere calls
      expect(qb.andWhere).toHaveBeenCalledTimes(4);
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('skips the status filter when status is "all"', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.list({ status: 'all' as OrderStatus, page: 1, pageSize: 20 });
      // Only fromDate/toDate branches skipped, no status call.
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('flattens joined user + package onto the response row', async () => {
      qb.getManyAndCount.mockResolvedValue([
        [
          {
            id: 'o-1',
            orderNo: 'ORD-1',
            status: OrderStatus.PAID,
            amountCents: 9900,
            user: { id: 'u-1', nickname: '小王', phoneHash: 'a1b2c3d4' },
            package: { id: 'p-1', name: '标准' },
          },
        ],
        1,
      ]);
      const res = await service.list({ page: 1, pageSize: 20 });
      expect(res.items[0]).toMatchObject({
        orderNo: 'ORD-1',
        userNickname: '小王',
        userPhoneMask: '****c3d4',
        packageName: '标准',
      });
    });
  });

  describe('detail', () => {
    it('throws NotFound when the order is missing', async () => {
      qb.getOne.mockResolvedValue(null);
      await expect(service.detail('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the joined order on hit', async () => {
      const order = { id: 'o-1', orderNo: 'ORD-1', user: { id: 'u-1' }, package: { id: 'p-1' } };
      qb.getOne.mockResolvedValue(order);
      const res = await service.detail('o-1');
      expect(res).toBe(order);
    });
  });
});
