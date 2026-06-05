import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { Order, PaymentMethod } from '../entities/order.entity';
import {
  ALIPAY_PAYMENT,
  PayUrlResult,
  PaymentRouter,
  PaymentService,
  WECHAT_PAYMENT,
} from './payment.types';

/**
 * Method-aware payment dispatcher.
 *
 * Why this exists: Task 16's design had OrderService inject a single
 * `PAYMENT_SERVICE` provider. That's fine when there's only one
 * provider, but once Task 17 added Alipay alongside Wechat the order
 * side needs to pick one based on the user's `method` choice. Putting
 * that `switch` here keeps `OrderService` free of provider knowledge
 * and gives the future notify controller (Task 18) a single seam to
 * resolve a provider from a `method` string.
 */
@Injectable()
export class PaymentRouterService implements PaymentRouter {
  private readonly providers: Record<PaymentMethod, PaymentService>;

  constructor(
    @Inject(WECHAT_PAYMENT) wechat: PaymentService,
    @Inject(ALIPAY_PAYMENT) alipay: PaymentService,
  ) {
    this.providers = {
      [PaymentMethod.WECHAT]: wechat,
      [PaymentMethod.ALIPAY]: alipay,
    };
  }

  async createPayUrl(method: PaymentMethod, order: Order): Promise<PayUrlResult> {
    return this.getService(method).createPayUrl(order);
  }

  getService(method: PaymentMethod): PaymentService {
    const svc = this.providers[method];
    if (!svc) {
      throw new BadRequestException(`不支持的支付方式: ${method}`);
    }
    return svc;
  }
}
