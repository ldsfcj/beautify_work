import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, PaymentMethod } from '../entities/order.entity';
import { CreditPackage } from '../entities/credit-package.entity';
import { User } from '../entities/user.entity';
import { OrderService } from './order.service';
import { PAYMENT_SERVICE, PaymentService, PayUrlResult } from '../payment/payment.types';

/**
 * OrderService unit tests. Order + package + user repos are stubbed
 * (these all hit the DB). The payment service is replaced with a
 * fake so we can verify the create() flow calls it with the right
 * order.
 */
describe('OrderService', () => {
  let service: OrderService;
  let orders: {
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
  };
  let packages: { findOneBy: jest.Mock; find: jest.Mock };
  let users: { findOneByOrFail: jest.Mock };
  let payment: { createPayUrl: jest.Mock };

  const PKG = {
    id: 'pkg-standard',
    name: '标准',
    credits: 220,
    priceCents: 9900,
    bonusCredits: 20,
    validityDays: 180,
    isActive: true,
    sortOrder: 20,
  };

  const USER_ID = 'user-1';

  beforeEach(async () => {
    orders = {
      create: jest.fn((values) => ({ id: 'order-1', ...values })),
      save: jest.fn(async (o) => o),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
    };
    packages = { findOneBy: jest.fn(), find: jest.fn() };
    users = { findOneByOrFail: jest.fn() };
    payment = { createPayUrl: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: orders },
        { provide: getRepositoryToken(CreditPackage), useValue: packages },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: PAYMENT_SERVICE, useValue: payment },
      ],
    }).compile();

    service = moduleRef.get(OrderService);
  });

  describe('create', () => {
    it('creates a pending order, calls payment, and returns order_no + pay URL', async () => {
      packages.findOneBy.mockResolvedValue(PKG);
      payment.createPayUrl.mockResolvedValue({
        h5_url: 'https://mock.pay/M1234567890',
        expire_at: new Date('2026-06-05T10:30:00Z'),
      } satisfies PayUrlResult);

      const result = await service.create(USER_ID, PKG.id, PaymentMethod.WECHAT);

      // Package looked up (active filter applied).
      expect(packages.findOneBy).toHaveBeenCalledWith({ id: PKG.id, isActive: true });
      // Order row created with denormalised credits + amount.
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          packageId: PKG.id,
          credits: PKG.credits + PKG.bonusCredits, // 240
          amountCents: PKG.priceCents,
          status: OrderStatus.PENDING,
          paymentMethod: PaymentMethod.WECHAT,
        }),
      );
      // Order saved.
      expect(orders.save).toHaveBeenCalled();
      // Payment called with the saved order.
      expect(payment.createPayUrl).toHaveBeenCalledWith(
        expect.objectContaining({ orderNo: expect.stringMatching(/^M[\w-]{12}$/) }),
      );
      // Return shape.
      expect(result).toMatchObject({
        order_no: expect.stringMatching(/^M[\w-]{12}$/),
        credits: 240,
        amount_cents: 9900,
        h5_url: 'https://mock.pay/M1234567890',
        expire_at: '2026-06-05T10:30:00.000Z',
      });
    });

    it('throws NotFoundException when the package is missing or inactive', async () => {
      packages.findOneBy.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, 'pkg-ghost', PaymentMethod.WECHAT),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(orders.save).not.toHaveBeenCalled();
      expect(payment.createPayUrl).not.toHaveBeenCalled();
    });

    it('rejects unknown payment methods with 400', async () => {
      packages.findOneBy.mockResolvedValue(PKG);

      await expect(
        service.create(USER_ID, PKG.id, 'bitcoin' as PaymentMethod),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses a unique order_no per call (nanoid 12 chars)', async () => {
      packages.findOneBy.mockResolvedValue(PKG);
      payment.createPayUrl.mockResolvedValue({
        h5_url: 'x',
        expire_at: new Date(),
      });

      const a = await service.create(USER_ID, PKG.id, PaymentMethod.WECHAT);
      const b = await service.create(USER_ID, PKG.id, PaymentMethod.WECHAT);
      // nanoid uses a 12-char alphabet by default; with the `M` prefix
      // each call gets a fresh, collision-free identifier.
      expect(a.order_no).not.toBe(b.order_no);
      expect(a.order_no.startsWith('M')).toBe(true);
    });
  });

  describe('list', () => {
    it('returns the user own orders, newest first, paginated', async () => {
      orders.findAndCount.mockResolvedValue([
        [
          { id: 'o2', orderNo: 'M222', createdAt: new Date('2026-06-02') },
          { id: 'o1', orderNo: 'M111', createdAt: new Date('2026-06-01') },
        ],
        2,
      ]);

      const result = await service.list(USER_ID, 1, 10);

      expect(orders.findAndCount).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.size).toBe(10);
    });

    it('coerces page/size to safe integers (clamps negatives, defaults 1/10)', async () => {
      orders.findAndCount.mockResolvedValue([[], 0]);

      // size=0 → fall back to default 10 (not clamp to 1)
      await service.list(USER_ID, 0, 0);
      expect(orders.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );

      // negative page → 1, huge size → 100 (capped)
      await service.list(USER_ID, -3, 9999);
      expect(orders.findAndCount).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );

      // non-integer size → default 10
      await service.list(USER_ID, 1, 3.5 as unknown as number);
      expect(orders.findAndCount).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('detail', () => {
    it('returns the order when owned by the requesting user', async () => {
      const order = { id: 'o1', orderNo: 'M111', userId: USER_ID, status: OrderStatus.PAID };
      orders.findOne.mockResolvedValue(order);

      const result = await service.detail(USER_ID, 'M111');
      expect(result).toEqual(order);
      expect(orders.findOne).toHaveBeenCalledWith({ where: { orderNo: 'M111' } });
    });

    it('throws NotFoundException when the order is missing', async () => {
      orders.findOne.mockResolvedValue(null);
      await expect(service.detail(USER_ID, 'M999')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the order belongs to another user', async () => {
      orders.findOne.mockResolvedValue({ orderNo: 'M111', userId: 'someone-else' });
      await expect(service.detail(USER_ID, 'M111')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
