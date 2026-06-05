import { Injectable } from '@nestjs/common';
import { Order } from '../entities/order.entity';
import { PayUrlResult, PaymentService } from './payment.types';

/**
 * Dev-mock payment provider. Returns a deterministic URL that the
 * frontend can render (or that a manual QA tester can visit). Real
 * Wechat / Alipay SDKs replace this binding in Task 16/17.
 *
 * The `expire_at` is `now + 30 min` to match the P2 spec — orders
 * past that point are eligible for auto-cancellation by the
 * dailyReconcile cron (Task 18).
 */
@Injectable()
export class MockPaymentService implements PaymentService {
  private readonly EXPIRE_MINUTES = 30;

  async createPayUrl(order: Order): Promise<PayUrlResult> {
    const expireAt = new Date(Date.now() + this.EXPIRE_MINUTES * 60_000);
    return {
      h5_url: `https://mock.pay/${order.orderNo}`,
      expire_at: expireAt,
    };
  }
}
