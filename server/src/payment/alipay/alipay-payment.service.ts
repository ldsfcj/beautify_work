import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order } from '../../entities/order.entity';
import {
  NotifyHeaders,
  PayUrlResult,
  PaymentNotifyData,
  PaymentQueryResult,
  PaymentService,
} from '../payment.types';

/**
 * Alipay H5 pay wrapper (手机网站支付 / alipay.trade.wap.pay).
 *
 * (deferred) The real `alipay-sdk` package is a production-only
 * dependency — it is NOT listed in package.json yet. Install in prod
 * with:
 *
 *   cd server && npm install alipay-sdk
 *
 * Behavior:
 *   - In dev / test (anything other than `NODE_ENV=production`), this
 *     returns a deterministic mock URL so the order flow can be wired
 *     end-to-end without real credentials.
 *   - In production, the SDK is required at call time (lazy load) and
 *     `alipay.trade.wap.pay` is invoked. **Amount unit**: alipay uses
 *     yuan (not cents) and requires a `.toFixed(2)` string.
 */
@Injectable()
export class AlipayPaymentService implements PaymentService {
  private readonly logger = new Logger(AlipayPaymentService.name);
  private readonly EXPIRE_MINUTES = 30;
  private sdk: any | null = null;

  constructor(private readonly cfg: ConfigService) {}

  async createPayUrl(order: Order): Promise<PayUrlResult> {
    if (process.env.NODE_ENV !== 'production') {
      return this.mockUrl(order);
    }
    return this.realH5Url(order);
  }

  private mockUrl(order: Order): PayUrlResult {
    const expireAt = new Date(Date.now() + this.EXPIRE_MINUTES * 60_000);
    return {
      h5_url: `https://openapi.alipay.com/mock?order_no=${order.orderNo}`,
      expire_at: expireAt,
    };
  }

  private async realH5Url(order: Order): Promise<PayUrlResult> {
    const sdk = this.loadSdk();
    const url: string = await sdk.exec('alipay.trade.wap.pay', {
      notify_url: this.require('ALIPAY_NOTIFY_URL'),
      bizContent: {
        out_trade_no: order.orderNo,
        total_amount: (order.amountCents / 100).toFixed(2),
        subject: `积分套餐-${order.credits}`,
        product_code: 'QUICK_WAP_WAY',
      },
    });
    return {
      h5_url: url,
      expire_at: new Date(Date.now() + this.EXPIRE_MINUTES * 60_000),
    };
  }

  private loadSdk(): any {
    if (this.sdk) return this.sdk;
    const appId = this.require('ALIPAY_APP_ID');
    const privateKey = this.require('ALIPAY_PRIVATE_KEY');
    const alipayPublicKey = this.require('ALIPAY_PUBLIC_KEY');

    let AlipaySdk: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      AlipaySdk = require('alipay-sdk');
    } catch (e: any) {
      throw new ServiceUnavailableException(
        `alipay-sdk is not installed. Run \`npm install alipay-sdk\` in server/ before enabling prod Alipay pay. (${e?.message ?? e})`,
      );
    }

    this.sdk = new AlipaySdk({
      appId,
      privateKey,
      alipayPublicKey,
    });
    return this.sdk;
  }

  private require(key: string): string {
    const v = this.cfg.get<string>(key);
    if (!v) {
      throw new ServiceUnavailableException(
        `Missing required Alipay pay config: ${key}`,
      );
    }
    return v;
  }

  // ── Task 18 notify / reconcile surface ──────────────────────────────
  //
  // Mock mode (dev / test) covers the full notify shape so end-to-end
  // flows and the reconcile cron can be exercised without real keys.
  // Prod path is a lazy-load shim mirroring createPayUrl (Task 17) —
  // the SDK calls are stubbed and will be wired when alipay-sdk lands
  // in production.

  /**
   * Verify the Alipay notify signature. Dev/test accepts a sentinel
   * header `x-mock-sign: ok`; prod delegates to alipay-sdk's
   * `checkNotifySignV2` (deferred).
   */
  verifySign(_rawBody: string, headers: NotifyHeaders): boolean {
    if (process.env.NODE_ENV !== 'production') {
      return headers['x-mock-sign'] === 'ok';
    }
    // (deferred) Real prod path uses alipay-sdk:
    //   const sdk = this.loadSdk();
    //   return sdk.checkNotifySignV2(parsedParams);
    throw new ServiceUnavailableException(
      'Alipay verifySign not wired for production yet — install alipay-sdk and finish SDK integration first.',
    );
  }

  /**
   * Parse Alipay's form-urlencoded notify body and map field names /
   * status enum into our normalised shape. Alipay's `trade_status`
   * values (TRADE_SUCCESS / TRADE_FINISHED / TRADE_CLOSED / WAIT_BUYER_PAY)
   * are collapsed into SUCCESS / CLOSED / FAIL.
   */
  async decodeNotify(rawBody: string): Promise<PaymentNotifyData> {
    if (process.env.NODE_ENV !== 'production') {
      const params = new URLSearchParams(rawBody);
      const outTradeNo = params.get('out_trade_no');
      if (!outTradeNo) {
        throw new Error('decodeNotify: missing out_trade_no in body');
      }
      const tradeStatus = params.get('trade_status') ?? '';
      return {
        outTradeNo,
        transactionId: params.get('trade_no') ?? '',
        tradeState: this.mapTradeStatus(tradeStatus),
      };
    }
    throw new ServiceUnavailableException(
      'Alipay decodeNotify not wired for production yet.',
    );
  }

  /**
   * Active-poll Alipay for an order's current state. Dev/test returns
   * a deterministic SUCCESS so the reconcile cron's happy path can be
   * exercised; tests that need other states mock this method directly.
   */
  async queryOrder(orderNo: string): Promise<PaymentQueryResult> {
    if (process.env.NODE_ENV !== 'production') {
      return {
        tradeState: 'SUCCESS',
        transactionId: `MOCK_ALIPAY_TXN_${orderNo}`,
      };
    }
    throw new ServiceUnavailableException(
      'Alipay queryOrder not wired for production yet.',
    );
  }

  /**
   * Alipay → normalised tradeState. TRADE_FINISHED is also SUCCESS
   * (post-refund-window settlement); anything we don't recognise as a
   * terminal-success / terminal-closed maps to FAIL so the caller
   * treats it as "do not credit yet."
   */
  private mapTradeStatus(s: string): PaymentNotifyData['tradeState'] {
    if (s === 'TRADE_SUCCESS' || s === 'TRADE_FINISHED') return 'SUCCESS';
    if (s === 'TRADE_CLOSED') return 'CLOSED';
    return 'FAIL';
  }
}
