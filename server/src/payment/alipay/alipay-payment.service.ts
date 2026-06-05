import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order } from '../../entities/order.entity';
import { PayUrlResult, PaymentService } from '../payment.types';

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
}
