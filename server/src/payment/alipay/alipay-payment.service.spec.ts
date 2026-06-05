import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Order, PaymentMethod } from '../../entities/order.entity';
import { PayUrlResult } from '../payment.types';
import { AlipayPaymentService } from './alipay-payment.service';

/**
 * Unit tests for the AlipayPaymentService.
 *
 * Mirrors the WechatPaymentService spec structure. The real
 * `alipay-sdk` package is **not** installed in dev (Task 17 ships a
 * mock-fallback path; the SDK is a prod-only dependency). The
 * `{ virtual: true }` jest.mock tells Jest the module may not exist
 * on disk — this lets us assert the prod code path without polluting
 * package.json.
 *
 * Coverage:
 *   1. Dev / non-production env → returns the mock openapi URL and
 *      does NOT instantiate the SDK constructor.
 *   2. Production env → calls `sdk.exec('alipay.trade.wap.pay', ...)`
 *      with cents→yuan conversion (.toFixed(2)) and forwards the
 *      returned URL string.
 *   3. Production env without required config → throws a descriptive
 *      error instead of silently calling the SDK with undefined fields.
 */
describe('AlipayPaymentService', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;
  const order: Order = {
    id: 'order-uuid-1',
    orderNo: 'O20260605001',
    userId: 'user-1',
    packageId: 'pkg-1',
    credits: 220,
    amountCents: 9900,
    status: 'pending' as any,
    paymentMethod: PaymentMethod.ALIPAY,
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
    it('returns the mock openapi URL and skips SDK instantiation', async () => {
      const AlipaySdkCtor = jest.fn();
      jest.doMock('alipay-sdk', () => AlipaySdkCtor, { virtual: true });

      const moduleRef = await Test.createTestingModule({
        providers: [
          AlipayPaymentService,
          { provide: ConfigService, useValue: buildConfig({}) },
        ],
      }).compile();

      const service = moduleRef.get(AlipayPaymentService);
      const result: PayUrlResult = await service.createPayUrl(order);

      expect(result.h5_url).toBe(
        'https://openapi.alipay.com/mock?order_no=O20260605001',
      );
      expect(result.expire_at).toBeInstanceOf(Date);
      const delta = result.expire_at.getTime() - Date.now();
      expect(delta).toBeGreaterThan(29 * 60_000);
      expect(delta).toBeLessThan(31 * 60_000);
      expect(AlipaySdkCtor).not.toHaveBeenCalled();
    });
  });

  describe('production env', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('calls alipay.trade.wap.pay and forwards the returned URL', async () => {
      const exec = jest.fn().mockResolvedValue(
        'https://openapi.alipay.com/gateway.do?sign=xxx&out_trade_no=O20260605001',
      );
      const AlipaySdkCtor = jest.fn().mockImplementation(() => ({ exec }));
      jest.doMock('alipay-sdk', () => AlipaySdkCtor, { virtual: true });

      const moduleRef = await Test.createTestingModule({
        providers: [
          AlipayPaymentService,
          {
            provide: ConfigService,
            useValue: buildConfig({
              ALIPAY_APP_ID: '2021000000000001',
              ALIPAY_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
              ALIPAY_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----',
              ALIPAY_NOTIFY_URL: 'https://api.example.com/api/payment/alipay/notify',
            }),
          },
        ],
      }).compile();

      const service = moduleRef.get(AlipayPaymentService);
      const result = await service.createPayUrl(order);

      expect(AlipaySdkCtor).toHaveBeenCalledTimes(1);
      expect(AlipaySdkCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: '2021000000000001',
          privateKey: expect.stringContaining('BEGIN RSA PRIVATE KEY'),
          alipayPublicKey: expect.stringContaining('BEGIN PUBLIC KEY'),
        }),
      );
      expect(exec).toHaveBeenCalledWith(
        'alipay.trade.wap.pay',
        expect.objectContaining({
          notify_url: 'https://api.example.com/api/payment/alipay/notify',
          bizContent: expect.objectContaining({
            out_trade_no: 'O20260605001',
            total_amount: '99.00', // 9900 cents → 99.00 yuan
            subject: '积分套餐-220',
            product_code: 'QUICK_WAP_WAY',
          }),
        }),
      );
      expect(result.h5_url).toBe(
        'https://openapi.alipay.com/gateway.do?sign=xxx&out_trade_no=O20260605001',
      );
    });

    it('throws a descriptive error when required ALIPAY_* config is missing', async () => {
      const AlipaySdkCtor = jest.fn();
      jest.doMock('alipay-sdk', () => AlipaySdkCtor, { virtual: true });

      const moduleRef = await Test.createTestingModule({
        providers: [
          AlipayPaymentService,
          {
            provide: ConfigService,
            useValue: buildConfig({
              // ALIPAY_PRIVATE_KEY deliberately missing
              ALIPAY_APP_ID: '2021000000000001',
              ALIPAY_PUBLIC_KEY: 'fake-pub',
              ALIPAY_NOTIFY_URL: 'https://api.example.com/notify',
            }),
          },
        ],
      }).compile();

      const service = moduleRef.get(AlipayPaymentService);
      await expect(service.createPayUrl(order)).rejects.toThrow(
        /ALIPAY_PRIVATE_KEY/,
      );
      expect(AlipaySdkCtor).not.toHaveBeenCalled();
    });
  });

  // ── Task 18 notify / reconcile surface ──────────────────────────────
  //
  // Alipay notify body is form-urlencoded (not XML) and the field names
  // differ from Wechat:
  //   out_trade_no  → outTradeNo
  //   trade_no      → transactionId
  //   trade_status  → tradeState  (TRADE_SUCCESS / TRADE_CLOSED / others → FAIL)
  //
  // Like Wechat, only mock mode is fully covered. Prod path delegates
  // to the SDK and is wired when alipay-sdk lands in production.

  describe('verifySign (mock)', () => {
    function buildService(): AlipayPaymentService {
      return new AlipayPaymentService(buildConfig({}) as ConfigService);
    }

    it('returns true when the sentinel header x-mock-sign=ok is present', () => {
      const svc = buildService();
      expect(
        svc.verifySign('out_trade_no=O1', { 'x-mock-sign': 'ok' }),
      ).toBe(true);
    });

    it('returns false when the sentinel header is missing or wrong', () => {
      const svc = buildService();
      expect(svc.verifySign('out_trade_no=O1', {})).toBe(false);
      expect(svc.verifySign('out_trade_no=O1', { 'x-mock-sign': 'bad' })).toBe(
        false,
      );
    });
  });

  describe('decodeNotify (mock)', () => {
    function buildService(): AlipayPaymentService {
      return new AlipayPaymentService(buildConfig({}) as ConfigService);
    }

    it('parses form-urlencoded body and maps TRADE_SUCCESS to SUCCESS', async () => {
      const svc = buildService();
      const body =
        'out_trade_no=O20260605001&trade_no=2026060522001&trade_status=TRADE_SUCCESS&sign=ZZZ';
      await expect(svc.decodeNotify(body)).resolves.toEqual({
        outTradeNo: 'O20260605001',
        transactionId: '2026060522001',
        tradeState: 'SUCCESS',
      });
    });

    it('maps TRADE_CLOSED to CLOSED and unknown statuses to FAIL', async () => {
      const svc = buildService();
      await expect(
        svc.decodeNotify(
          'out_trade_no=O2&trade_no=TX2&trade_status=TRADE_CLOSED',
        ),
      ).resolves.toMatchObject({ tradeState: 'CLOSED' });

      await expect(
        svc.decodeNotify(
          'out_trade_no=O3&trade_no=TX3&trade_status=WAIT_BUYER_PAY',
        ),
      ).resolves.toMatchObject({ tradeState: 'FAIL' });
    });

    it('throws when out_trade_no is missing from the body', async () => {
      const svc = buildService();
      await expect(svc.decodeNotify('trade_no=TX')).rejects.toThrow(
        /out_trade_no/,
      );
    });

    it('decodes URL-encoded values correctly', async () => {
      const svc = buildService();
      const body =
        'out_trade_no=O%2F1&trade_no=TX%201&trade_status=TRADE_SUCCESS';
      await expect(svc.decodeNotify(body)).resolves.toMatchObject({
        outTradeNo: 'O/1',
        transactionId: 'TX 1',
      });
    });
  });

  describe('queryOrder (mock)', () => {
    function buildService(): AlipayPaymentService {
      return new AlipayPaymentService(buildConfig({}) as ConfigService);
    }

    it('returns SUCCESS + a deterministic mock trade_no', async () => {
      const svc = buildService();
      const r = await svc.queryOrder('O20260605001');
      expect(r.tradeState).toBe('SUCCESS');
      expect(r.transactionId).toBe('MOCK_ALIPAY_TXN_O20260605001');
    });
  });
});
