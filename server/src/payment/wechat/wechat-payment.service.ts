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
 * Wechat H5 pay wrapper.
 *
 * (deferred) The real `wechatpay-node-v3` SDK is a production-only
 * dependency — it is NOT listed in package.json yet. Install in prod
 * with:
 *
 *   cd server && npm install wechatpay-node-v3
 *
 * Behavior:
 *   - In dev / test (anything other than `NODE_ENV=production`), this
 *     returns a deterministic mock URL so the order flow can be wired
 *     end-to-end without real credentials.
 *   - In production, the SDK is required at call time (lazy load) and
 *     `transactions_h5` is invoked to obtain the H5 redirect URL. The
 *     certificate files (`apiclient_cert.pem`, `apiclient_key.pem`) are
 *     also deferred — see Runbook Task 16 for the prod cutover plan.
 */
@Injectable()
export class WechatPaymentService implements PaymentService {
  private readonly logger = new Logger(WechatPaymentService.name);
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
      h5_url: `https://wx.tenpay.com/mock?order_no=${order.orderNo}`,
      expire_at: expireAt,
    };
  }

  private async realH5Url(order: Order): Promise<PayUrlResult> {
    const pay = this.loadSdk();
    const res = await pay.transactions_h5({
      description: `积分套餐-${order.credits}`,
      out_trade_no: order.orderNo,
      notify_url: this.require('WECHATPAY_NOTIFY_URL'),
      amount: { total: order.amountCents, currency: 'CNY' },
      scene_info: {
        h5_info: { type: 'Wap', app_name: '医美咨询', app_url: 'https://' },
      },
    });
    return {
      h5_url: res.h5_url,
      expire_at: new Date(Date.now() + this.EXPIRE_MINUTES * 60_000),
    };
  }

  /**
   * Lazy SDK load. We `require` (not `import`) so the module is not
   * resolved at boot when the package is absent from dev installs.
   */
  private loadSdk(): any {
    if (this.sdk) return this.sdk;
    // Read the four required fields up front so we fail fast and clearly
    // — better than a cryptic "Cannot read property 'mchid' of undefined"
    // from inside the SDK constructor.
    const appid = this.require('WECHATPAY_APPID');
    const mchid = this.require('WECHATPAY_MCH_ID');
    const key = this.require('WECHATPAY_API_V3_KEY');

    let WxPay: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      WxPay = require('wechatpay-node-v3');
    } catch (e: any) {
      throw new ServiceUnavailableException(
        `wechatpay-node-v3 is not installed. Run \`npm install wechatpay-node-v3\` in server/ before enabling prod Wechat pay. (${e?.message ?? e})`,
      );
    }

    this.sdk = new WxPay({
      appid,
      mchid,
      publicKey: undefined, // (deferred) apiclient_cert.pem
      privateKey: undefined, // (deferred) apiclient_key.pem
      key,
    });
    return this.sdk;
  }

  private require(key: string): string {
    const v = this.cfg.get<string>(key);
    if (!v) {
      throw new ServiceUnavailableException(
        `Missing required Wechat pay config: ${key}`,
      );
    }
    return v;
  }

  // ── Task 18 notify / reconcile surface ──────────────────────────────
  //
  // Mock mode (dev / test) provides full coverage so end-to-end flows
  // and the reconcile cron can be exercised without real credentials.
  // Prod mode is left as a lazy-load shim mirroring createPayUrl's
  // pattern — the SDK calls are stubbed here and will be wired when
  // wechatpay-node-v3 is actually installed in production.

  /**
   * Verify a Wechat notify signature. Dev/test accepts a sentinel
   * header `x-mock-sign: ok` so curl-driven flows work; any other
   * value (or missing) fails the check. Prod path delegates to the
   * SDK's signature verifier (deferred).
   */
  verifySign(_rawBody: string, headers: NotifyHeaders): boolean {
    if (process.env.NODE_ENV !== 'production') {
      return headers['x-mock-sign'] === 'ok';
    }
    // (deferred) Real prod path uses wechatpay-node-v3:
    //   const pay = this.loadSdk();
    //   return pay.verifySign({ timestamp, nonce, body, signature });
    // For now, refuse in prod until the SDK path is fully wired.
    throw new ServiceUnavailableException(
      'Wechat verifySign not wired for production yet — install wechatpay-node-v3 and finish SDK integration first.',
    );
  }

  /**
   * Parse the Wechat notify body. Dev/test extracts the three fields
   * from a minimal XML envelope using regex (no XML parser dep). Prod
   * path uses the SDK's `decipher_gcm` decoder (deferred).
   */
  async decodeNotify(rawBody: string): Promise<PaymentNotifyData> {
    if (process.env.NODE_ENV !== 'production') {
      const outTradeNo = this.pickXmlField(rawBody, 'out_trade_no');
      if (!outTradeNo) {
        throw new Error('decodeNotify: missing out_trade_no in body');
      }
      const transactionId = this.pickXmlField(rawBody, 'transaction_id') ?? '';
      const tradeState =
        (this.pickXmlField(rawBody, 'trade_state') ?? 'FAIL') as
          PaymentNotifyData['tradeState'];
      return { outTradeNo, transactionId, tradeState };
    }
    throw new ServiceUnavailableException(
      'Wechat decodeNotify not wired for production yet.',
    );
  }

  /**
   * Active-poll Wechat for an order's current state. Dev/test returns
   * a deterministic SUCCESS so the reconcile cron's happy path can be
   * exercised; tests that need other states mock this method directly.
   */
  async queryOrder(orderNo: string): Promise<PaymentQueryResult> {
    if (process.env.NODE_ENV !== 'production') {
      return {
        tradeState: 'SUCCESS',
        transactionId: `MOCK_WX_TXN_${orderNo}`,
      };
    }
    throw new ServiceUnavailableException(
      'Wechat queryOrder not wired for production yet.',
    );
  }

  private pickXmlField(xml: string, name: string): string | null {
    // Minimal extractor — accepts both `<name>val</name>` and
    // CDATA-wrapped values; trims whitespace.
    const re = new RegExp(
      `<${name}>\\s*(?:<!\\[CDATA\\[(.*?)\\]\\]>|([^<]+?))\\s*</${name}>`,
      's',
    );
    const m = xml.match(re);
    if (!m) return null;
    return (m[1] ?? m[2] ?? '').trim();
  }
}
