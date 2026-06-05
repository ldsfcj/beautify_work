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
 * Decoded payment notification payload. Task 18 normalises the
 * provider-specific notify body (Wechat XML / Alipay form) into this
 * shape so the PaymentService callback handler stays provider-agnostic.
 */
export interface PaymentNotifyData {
  outTradeNo: string;
  transactionId: string;
  tradeState: 'SUCCESS' | 'FAIL' | 'CLOSED';
}

/**
 * Result of the active-poll "query order" API used by the daily
 * reconcile cron (Task 18) — when a notify is missed or dropped we
 * ask the provider directly. `PENDING` means the user has not yet
 * paid; `CLOSED` is provider-side timeout/cancellation; `FAIL` is
 * an explicit failure event.
 */
export interface PaymentQueryResult {
  tradeState: 'SUCCESS' | 'PENDING' | 'CLOSED' | 'FAIL';
  transactionId?: string;
}

/**
 * Headers shape passed to verifySign — providers each pick different
 * fields out of the HTTP request (Wechat uses `wechatpay-signature`,
 * Alipay uses `sign` from the form body), so the interface just hands
 * over the full headers map.
 */
export type NotifyHeaders = Record<string, string | string[] | undefined>;

/**
 * Abstraction over Wechat / Alipay / future providers. Task 16/17
 * wire the create-pay path; Task 18 adds the callback / reconcile
 * surface. The order side depends on PaymentRouter (not this interface
 * directly) for createPayUrl; the notify controller resolves a
 * provider via `router.getService(method)` and then calls the verify /
 * decode / query methods.
 */
export interface PaymentService {
  createPayUrl(order: Order): Promise<PayUrlResult>;

  /**
   * Verify the provider signature on a raw notify body. `true` means
   * the payload is authentic and may be acted on. In dev/test the
   * mock implementation accepts a sentinel header (`x-mock-sign: ok`)
   * so end-to-end flows can be exercised without real keys.
   */
  verifySign(rawBody: string, headers: NotifyHeaders): boolean | Promise<boolean>;

  /**
   * Parse the raw notify body into the normalised shape. Callers must
   * verify the signature first — this method does NOT re-check.
   */
  decodeNotify(rawBody: string): Promise<PaymentNotifyData>;

  /**
   * Active-poll the provider for an order's current state. Used by
   * the daily reconcile cron when an order has been pending past the
   * 30-minute window and we want to resolve it without waiting for
   * a possibly-lost notify.
   */
  queryOrder(orderNo: string): Promise<PaymentQueryResult>;
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

