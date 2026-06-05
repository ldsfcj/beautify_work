import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Order, PaymentMethod } from '../../entities/order.entity';
import { PayUrlResult } from '../payment.types';
import { WechatPaymentService } from './wechat-payment.service';

/**
 * Unit tests for the WechatPaymentService.
 *
 * The real `wechatpay-node-v3` package is **not** installed in dev (Task 16
 * ships a mock-fallback path; the SDK is a prod-only dependency). The
 * `{ virtual: true }` jest.mock tells Jest the module may not exist on disk
 * — this lets us assert the prod code path without polluting package.json.
 *
 * Coverage:
 *   1. Dev / non-production env → returns the mock wx.tenpay.com URL and
 *      does NOT instantiate the SDK constructor.
 *   2. Production env → calls `transactions_h5` with the mapped payload
 *      (description / out_trade_no / amount / scene_info / notify_url)
 *      and forwards the returned `h5_url`.
 *   3. Production env without required config → throws a descriptive error
 *      instead of silently calling the SDK with undefined fields.
 */
describe('WechatPaymentService', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;
  const order: Order = {
    id: 'order-uuid-1',
    orderNo: 'O20260605001',
    userId: 'user-1',
    packageId: 'pkg-1',
    credits: 220,
    amountCents: 9900,
    status: 'pending' as any,
    paymentMethod: PaymentMethod.WECHAT,
    txnId: null,
    paidAt: null,
    createdAt: new Date('2026-06-05T10:00:00Z'),
  } as Order;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    jest.resetModules();
    jest.clearAllMocks();
  });

  function buildConfig(values: Record<string, any>): Partial<ConfigService> {
    return {
      get: jest.fn((key: string) => values[key]),
    };
  }

  describe('dev / non-production env', () => {
    it('returns the mock wx.tenpay.com URL and skips SDK instantiation', async () => {
      const WxPayCtor = jest.fn();
      jest.doMock('wechatpay-node-v3', () => WxPayCtor, { virtual: true });

      const moduleRef = await Test.createTestingModule({
        providers: [
          WechatPaymentService,
          { provide: ConfigService, useValue: buildConfig({}) },
        ],
      }).compile();

      const service = moduleRef.get(WechatPaymentService);
      const result: PayUrlResult = await service.createPayUrl(order);

      expect(result.h5_url).toBe(
        'https://wx.tenpay.com/mock?order_no=O20260605001',
      );
      expect(result.expire_at).toBeInstanceOf(Date);
      // expire_at must be roughly 30 minutes in the future
      const delta = result.expire_at.getTime() - Date.now();
      expect(delta).toBeGreaterThan(29 * 60_000);
      expect(delta).toBeLessThan(31 * 60_000);
      expect(WxPayCtor).not.toHaveBeenCalled();
    });
  });

  describe('production env', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('calls transactions_h5 and forwards h5_url from the SDK response', async () => {
      const transactionsH5 = jest.fn().mockResolvedValue({
        h5_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx-real-1',
      });
      const WxPayCtor = jest.fn().mockImplementation(() => ({
        transactions_h5: transactionsH5,
      }));
      jest.doMock('wechatpay-node-v3', () => WxPayCtor, { virtual: true });

      const moduleRef = await Test.createTestingModule({
        providers: [
          WechatPaymentService,
          {
            provide: ConfigService,
            useValue: buildConfig({
              WECHATPAY_APPID: 'wx-app-1',
              WECHATPAY_MCH_ID: '1900000001',
              WECHATPAY_API_V3_KEY: 'v3-key-32-chars-aaaaaaaaaaaa',
              WECHATPAY_NOTIFY_URL: 'https://api.example.com/api/payment/wechat/notify',
            }),
          },
        ],
      }).compile();

      const service = moduleRef.get(WechatPaymentService);
      const result = await service.createPayUrl(order);

      expect(WxPayCtor).toHaveBeenCalledTimes(1);
      expect(transactionsH5).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '积分套餐-220',
          out_trade_no: 'O20260605001',
          amount: { total: 9900, currency: 'CNY' },
          notify_url:
            'https://api.example.com/api/payment/wechat/notify',
          scene_info: expect.objectContaining({
            h5_info: expect.objectContaining({ type: 'Wap' }),
          }),
        }),
      );
      expect(result.h5_url).toBe(
        'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx-real-1',
      );
    });

    it('throws a descriptive error when required WECHATPAY_* config is missing', async () => {
      // SDK constructor should never be reached if config is incomplete
      const WxPayCtor = jest.fn();
      jest.doMock('wechatpay-node-v3', () => WxPayCtor, { virtual: true });

      const moduleRef = await Test.createTestingModule({
        providers: [
          WechatPaymentService,
          {
            provide: ConfigService,
            useValue: buildConfig({
              // WECHATPAY_MCH_ID deliberately missing
              WECHATPAY_APPID: 'wx-app-1',
              WECHATPAY_API_V3_KEY: 'v3-key-32-chars-aaaaaaaaaaaa',
              WECHATPAY_NOTIFY_URL: 'https://api.example.com/notify',
            }),
          },
        ],
      }).compile();

      const service = moduleRef.get(WechatPaymentService);
      await expect(service.createPayUrl(order)).rejects.toThrow(
        /WECHATPAY_MCH_ID/,
      );
      expect(WxPayCtor).not.toHaveBeenCalled();
    });
  });
});
