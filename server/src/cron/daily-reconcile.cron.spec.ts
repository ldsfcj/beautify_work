import { Repository } from 'typeorm';
import { Order, OrderStatus, PaymentMethod } from '../entities/order.entity';
import { PaymentService } from '../payment/payment.service';
import {
  PaymentRouter,
  PaymentService as PaymentProvider,
} from '../payment/payment.types';
import { DailyReconcileCron } from './daily-reconcile.cron';

/**
 * Unit tests for the daily reconcile cron.
 *
 * Cron policy: every day at 02:00, find every order that has been
 * `pending` for more than 30 minutes and ask the provider directly
 * what state it's in. SUCCESS → settle it through the same code path
 * the notify handler uses; everything else → emit a warning so a
 * human can investigate (proper alerting wires in at Task 24).
 *
 * Coverage:
 *   1. No stale orders → no queryOrder calls, returns zeros.
 *   2. SUCCESS poll → credits the order via PaymentService and
 *      counts it as credited.
 *   3. PENDING / CLOSED poll → no credit, warn counter ticks.
 *   4. Orders without a paymentMethod (user abandoned at method
 *      pick) → warned, never polled.
 *   5. Mixed batch → each order goes its own way; one failure
 *      doesn't abort the rest.
 */
describe('DailyReconcileCron', () => {
  let cron: DailyReconcileCron;
  let orders: jest.Mocked<Pick<Repository<Order>, 'find'>>;
  let router: PaymentRouter;
  let wechat: jest.Mocked<PaymentProvider>;
  let alipay: jest.Mocked<PaymentProvider>;
  let payment: jest.Mocked<Pick<PaymentService, 'creditOrderFromReconcile'>>;
  let warnSpy: jest.SpyInstance;

  function makeProvider(): jest.Mocked<PaymentProvider> {
    return {
      createPayUrl: jest.fn(),
      verifySign: jest.fn(),
      decodeNotify: jest.fn(),
      queryOrder: jest.fn(),
    } as unknown as jest.Mocked<PaymentProvider>;
  }

  function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
      id: 'order-uuid-1',
      orderNo: 'O20260605001',
      userId: 'user-1',
      packageId: 'pkg-1',
      credits: 220,
      amountCents: 9900,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.WECHAT,
      txnId: null,
      paidAt: null,
      createdAt: new Date(Date.now() - 60 * 60_000), // 1h ago → stale
      ...overrides,
    } as Order;
  }

  beforeEach(() => {
    wechat = makeProvider();
    alipay = makeProvider();
    router = {
      createPayUrl: jest.fn(),
      getService: jest.fn((method: PaymentMethod) =>
        method === PaymentMethod.WECHAT ? wechat : alipay,
      ),
    };
    orders = { find: jest.fn() } as any;
    payment = {
      creditOrderFromReconcile: jest.fn().mockResolvedValue(undefined),
    } as any;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    cron = new DailyReconcileCron(
      orders as unknown as Repository<Order>,
      router,
      payment as unknown as PaymentService,
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('no stale orders → no provider calls, zero counts', async () => {
    orders.find.mockResolvedValue([]);

    const result = await cron.reconcile();

    expect(result).toEqual({ scanned: 0, credited: 0, warned: 0 });
    expect(wechat.queryOrder).not.toHaveBeenCalled();
    expect(alipay.queryOrder).not.toHaveBeenCalled();
    expect(payment.creditOrderFromReconcile).not.toHaveBeenCalled();
  });

  it('SUCCESS poll → credits via PaymentService, counts as credited', async () => {
    const stale = makeOrder({ paymentMethod: PaymentMethod.WECHAT });
    orders.find.mockResolvedValue([stale]);
    wechat.queryOrder.mockResolvedValue({
      tradeState: 'SUCCESS',
      transactionId: 'WX_RECON_42',
    });

    const result = await cron.reconcile();

    expect(wechat.queryOrder).toHaveBeenCalledWith(stale.orderNo);
    expect(payment.creditOrderFromReconcile).toHaveBeenCalledWith(
      stale,
      PaymentMethod.WECHAT,
      'WX_RECON_42',
    );
    expect(result).toEqual({ scanned: 1, credited: 1, warned: 0 });
  });

  it('PENDING / CLOSED poll → warns, does not credit', async () => {
    const stale = makeOrder({ paymentMethod: PaymentMethod.ALIPAY });
    orders.find.mockResolvedValue([stale]);
    alipay.queryOrder.mockResolvedValue({ tradeState: 'PENDING' });

    const result = await cron.reconcile();

    expect(payment.creditOrderFromReconcile).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(stale.orderNo),
    );
    expect(result).toEqual({ scanned: 1, credited: 0, warned: 1 });
  });

  it('order with no paymentMethod → warned, never polled', async () => {
    const stale = makeOrder({ paymentMethod: null });
    orders.find.mockResolvedValue([stale]);

    const result = await cron.reconcile();

    expect(wechat.queryOrder).not.toHaveBeenCalled();
    expect(alipay.queryOrder).not.toHaveBeenCalled();
    expect(payment.creditOrderFromReconcile).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, credited: 0, warned: 1 });
  });

  it('mixed batch — each order resolves independently', async () => {
    const successOrder = makeOrder({
      id: 'o-1',
      orderNo: 'O1',
      paymentMethod: PaymentMethod.WECHAT,
    });
    const stuckOrder = makeOrder({
      id: 'o-2',
      orderNo: 'O2',
      paymentMethod: PaymentMethod.ALIPAY,
    });
    const noMethodOrder = makeOrder({
      id: 'o-3',
      orderNo: 'O3',
      paymentMethod: null,
    });
    orders.find.mockResolvedValue([successOrder, stuckOrder, noMethodOrder]);
    wechat.queryOrder.mockResolvedValue({
      tradeState: 'SUCCESS',
      transactionId: 'WX_OK',
    });
    alipay.queryOrder.mockResolvedValue({ tradeState: 'PENDING' });

    const result = await cron.reconcile();

    expect(result).toEqual({ scanned: 3, credited: 1, warned: 2 });
    expect(payment.creditOrderFromReconcile).toHaveBeenCalledWith(
      successOrder,
      PaymentMethod.WECHAT,
      'WX_OK',
    );
    expect(payment.creditOrderFromReconcile).toHaveBeenCalledTimes(1);
  });

  it('queries with the right where-clause (pending + older than 30min)', async () => {
    orders.find.mockResolvedValue([]);
    await cron.reconcile();

    expect(orders.find).toHaveBeenCalledTimes(1);
    const arg = orders.find.mock.calls[0][0] as any;
    expect(arg.where.status).toBe(OrderStatus.PENDING);
    // createdAt should be a typeorm FindOperator (LessThan) — we
    // assert structurally rather than importing typeorm internals.
    expect(arg.where.createdAt).toBeDefined();
    // The cutoff is "now minus 30 minutes". We rebuild the operator's
    // raw value range and check it falls within a generous window.
    const op = arg.where.createdAt;
    const cutoff = (op as any)._value ?? (op as any).value;
    expect(cutoff).toBeInstanceOf(Date);
    const delta = Date.now() - cutoff.getTime();
    expect(delta).toBeGreaterThanOrEqual(30 * 60_000 - 5_000);
    expect(delta).toBeLessThanOrEqual(30 * 60_000 + 5_000);
  });
});
