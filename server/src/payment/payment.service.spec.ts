import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreditLedgerService } from '../credit/creditledger.service';
import { Order, OrderStatus, PaymentMethod } from '../entities/order.entity';
import { PaymentService } from './payment.service';
import {
  PaymentNotifyData,
  PaymentRouter,
  PaymentService as PaymentProvider,
} from './payment.types';

/**
 * Unit tests for PaymentService — the bridge that turns raw notify
 * payloads into ledger writes. Coverage matrix (mirrored for both
 * Wechat and Alipay where the format differs):
 *
 *   1. verifySign fails        → BadRequestException (the only path
 *      that returns non-success to the provider; everything else
 *      returns success to suppress retries).
 *   2. Order does not exist    → BadRequestException.
 *   3. Order already paid      → idempotent no-op; recharge / update
 *      are NEVER called again.
 *   4. trade_state != SUCCESS  → response is success (no retry), but
 *      no recharge / no status update.
 *   5. Happy path Wechat       → recharge + status flips to PAID +
 *      txnId / paidAt / paymentMethod recorded + response { SUCCESS }.
 *   6. Happy path Alipay       → recharge + status flips + response
 *      is the plain string "success" Alipay requires.
 */
describe('PaymentService', () => {
  let service: PaymentService;
  let wechat: jest.Mocked<PaymentProvider>;
  let alipay: jest.Mocked<PaymentProvider>;
  let router: PaymentRouter;
  let orders: jest.Mocked<Pick<Repository<Order>, 'findOne' | 'update'>>;
  let ledger: jest.Mocked<Pick<CreditLedgerService, 'recharge'>>;

  // Stable order fixture; tests clone-and-tweak per case.
  function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
      id: 'order-uuid-1',
      orderNo: 'O20260605001',
      userId: 'user-1',
      packageId: 'pkg-1',
      credits: 220,
      amountCents: 9900,
      status: OrderStatus.PENDING,
      paymentMethod: null,
      txnId: null,
      paidAt: null,
      createdAt: new Date('2026-06-05T10:00:00Z'),
      ...overrides,
    } as Order;
  }

  function makeProvider(): jest.Mocked<PaymentProvider> {
    return {
      createPayUrl: jest.fn(),
      verifySign: jest.fn(),
      decodeNotify: jest.fn(),
      queryOrder: jest.fn(),
    } as unknown as jest.Mocked<PaymentProvider>;
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
    orders = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as any;
    ledger = {
      recharge: jest.fn().mockResolvedValue({ balanceAfter: 220 }),
    } as any;
    const audit = { write: jest.fn().mockResolvedValue(undefined) } as any;

    service = new PaymentService(
      router,
      orders as unknown as Repository<Order>,
      ledger as unknown as CreditLedgerService,
      audit,
    );
  });

  describe('handleWechatNotify', () => {
    it('throws BadRequestException when the signature fails', async () => {
      wechat.verifySign.mockReturnValue(false);

      await expect(
        service.handleWechatNotify('<xml/>', { 'x-mock-sign': 'bad' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(wechat.decodeNotify).not.toHaveBeenCalled();
      expect(ledger.recharge).not.toHaveBeenCalled();
      expect(orders.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the order does not exist', async () => {
      wechat.verifySign.mockReturnValue(true);
      wechat.decodeNotify.mockResolvedValue({
        outTradeNo: 'O_MISSING',
        transactionId: 'WX1',
        tradeState: 'SUCCESS',
      });
      orders.findOne.mockResolvedValue(null);

      await expect(
        service.handleWechatNotify('<xml/>', { 'x-mock-sign': 'ok' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ledger.recharge).not.toHaveBeenCalled();
      expect(orders.update).not.toHaveBeenCalled();
    });

    it('is idempotent — already-paid order returns SUCCESS without recharge', async () => {
      const paid = makeOrder({
        status: OrderStatus.PAID,
        txnId: 'WX_EARLIER',
        paidAt: new Date('2026-06-05T09:00:00Z'),
      });
      wechat.verifySign.mockReturnValue(true);
      wechat.decodeNotify.mockResolvedValue({
        outTradeNo: paid.orderNo,
        transactionId: 'WX_DUP',
        tradeState: 'SUCCESS',
      });
      orders.findOne.mockResolvedValue(paid);

      const result = await service.handleWechatNotify('<xml/>', {
        'x-mock-sign': 'ok',
      });

      expect(result).toEqual({ code: 'SUCCESS', message: 'OK' });
      expect(ledger.recharge).not.toHaveBeenCalled();
      expect(orders.update).not.toHaveBeenCalled();
    });

    it('non-SUCCESS trade_state returns SUCCESS but does not credit', async () => {
      const pending = makeOrder();
      wechat.verifySign.mockReturnValue(true);
      wechat.decodeNotify.mockResolvedValue({
        outTradeNo: pending.orderNo,
        transactionId: 'WX_FAIL',
        tradeState: 'FAIL',
      });
      orders.findOne.mockResolvedValue(pending);

      const result = await service.handleWechatNotify('<xml/>', {
        'x-mock-sign': 'ok',
      });

      expect(result.code).toBe('SUCCESS'); // ack regardless to suppress retries
      expect(ledger.recharge).not.toHaveBeenCalled();
      expect(orders.update).not.toHaveBeenCalled();
    });

    it('happy path: credits + flips status + records txnId/paidAt/paymentMethod', async () => {
      const pending = makeOrder();
      const decoded: PaymentNotifyData = {
        outTradeNo: pending.orderNo,
        transactionId: 'WX_TXN_999',
        tradeState: 'SUCCESS',
      };
      wechat.verifySign.mockReturnValue(true);
      wechat.decodeNotify.mockResolvedValue(decoded);
      orders.findOne.mockResolvedValue(pending);

      const before = Date.now();
      const result = await service.handleWechatNotify('<xml/>', {
        'x-mock-sign': 'ok',
      });
      const after = Date.now();

      expect(result).toEqual({ code: 'SUCCESS', message: 'OK' });
      expect(ledger.recharge).toHaveBeenCalledWith(
        pending.userId,
        pending.credits,
        pending.orderNo,
      );
      expect(orders.update).toHaveBeenCalledTimes(1);
      const [updateId, updatePayload] = orders.update.mock.calls[0];
      expect(updateId).toBe(pending.id);
      expect(updatePayload).toMatchObject({
        status: OrderStatus.PAID,
        txnId: 'WX_TXN_999',
        paymentMethod: PaymentMethod.WECHAT,
      });
      const paidAt = (updatePayload as any).paidAt as Date;
      expect(paidAt).toBeInstanceOf(Date);
      expect(paidAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(paidAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('handleAlipayNotify', () => {
    it('happy path returns the plain string "success" Alipay requires', async () => {
      const pending = makeOrder();
      alipay.verifySign.mockReturnValue(true);
      alipay.decodeNotify.mockResolvedValue({
        outTradeNo: pending.orderNo,
        transactionId: 'ALI_TXN_42',
        tradeState: 'SUCCESS',
      });
      orders.findOne.mockResolvedValue(pending);

      const result = await service.handleAlipayNotify(
        'out_trade_no=O20260605001&trade_status=TRADE_SUCCESS',
        { 'x-mock-sign': 'ok' },
      );

      expect(result).toBe('success');
      expect(ledger.recharge).toHaveBeenCalledWith(
        pending.userId,
        pending.credits,
        pending.orderNo,
      );
      const [, updatePayload] = orders.update.mock.calls[0];
      expect(updatePayload).toMatchObject({
        status: OrderStatus.PAID,
        txnId: 'ALI_TXN_42',
        paymentMethod: PaymentMethod.ALIPAY,
      });
    });

    it('verifySign failure → BadRequestException, no recharge', async () => {
      alipay.verifySign.mockReturnValue(false);

      await expect(
        service.handleAlipayNotify('out_trade_no=O1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ledger.recharge).not.toHaveBeenCalled();
    });
  });
});
