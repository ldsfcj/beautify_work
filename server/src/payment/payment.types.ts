import { Order } from '../entities/order.entity';

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
 * Abstraction over Wechat / Alipay / future providers. Task 15 ships
 * a dev-mock implementation; Task 16/17 wire the real SDKs. Order
 * service depends only on this interface, so swapping providers is
 * a single DI binding change.
 */
export interface PaymentService {
  createPayUrl(order: Order): Promise<PayUrlResult>;
}

/** DI token — order.service injects through this so the concrete
 *  payment provider is swappable from the module layer. */
export const PAYMENT_SERVICE = Symbol('PAYMENT_SERVICE');
