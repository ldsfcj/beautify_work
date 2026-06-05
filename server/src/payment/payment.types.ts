import { Order, PaymentMethod } from '../entities/order.entity';

/**
 * What a payment provider hands back when an order is created. The
 * `h5_url` is the link the frontend opens (H5 redirect or QR scan);
 * `expire_at` is the absolute cutoff after which the order is
 * considered abandoned and may be auto-closed by the cron (Task 18).
 */
export interface PayUrlResult {
  h5_url: string;
  expire_at: Date;
}

/**
 * Abstraction over Wechat / Alipay / future providers. Task 16/17
 * wire the real SDKs; Task 15's dev-mock was replaced when we moved
 * to multiple-provider routing (see PaymentRouter). The order side
 * depends on PaymentRouter, not on this interface directly.
 */
export interface PaymentService {
  createPayUrl(order: Order): Promise<PayUrlResult>;
}

/**
 * Method-aware dispatcher. The order service holds the user's chosen
 * `PaymentMethod` and asks the router to forward the call to the
 * correct provider. `getService` is exposed so the callback handler
 * (Task 18) can route a `POST /api/payment/{wechat|alipay}/notify`
 * payload back to the same provider that issued the order.
 */
export interface PaymentRouter {
  createPayUrl(method: PaymentMethod, order: Order): Promise<PayUrlResult>;
  getService(method: PaymentMethod): PaymentService;
}

/**
 * DI token — order.service and (later) the notify controller inject
 * through this. Concrete providers are bound in PaymentModule.
 */
export const PAYMENT_ROUTER = Symbol('PAYMENT_ROUTER');

/**
 * Per-provider injection tokens. `PaymentRouterService` takes two
 * `PaymentService`-typed args; without distinct tokens NestJS can't
 * tell which is Wechat and which is Alipay. These tokens are
 * module-internal — only PaymentModule binds them.
 */
export const WECHAT_PAYMENT = Symbol('WECHAT_PAYMENT');
export const ALIPAY_PAYMENT = Symbol('ALIPAY_PAYMENT');

