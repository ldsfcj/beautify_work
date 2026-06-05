import { BadRequestException } from '@nestjs/common';
import { Order, PaymentMethod } from '../entities/order.entity';
import { PayUrlResult, PaymentService } from './payment.types';
import { PaymentRouterService } from './payment.router';

/**
 * Unit tests for the PaymentRouter. The router is a thin dispatcher —
 * the real coverage of SDK behavior lives in each provider's own
 * spec. Here we only assert:
 *   1. createPayUrl(wechat, …) forwards to the Wechat provider.
 *   2. createPayUrl(alipay, …) forwards to the Alipay provider.
 *   3. Unknown method → BadRequestException with a clear message.
 *   4. getService() returns the same instance the router uses
 *      (Task 18 will rely on this identity for the notify endpoint).
 */
describe('PaymentRouterService', () => {
  const order = { orderNo: 'O1' } as Order;

  function makeProvider(label: string): PaymentService & { label: string } {
    const svc: PaymentService & { label: string } = {
      label,
      createPayUrl: jest.fn(async (o: Order): Promise<PayUrlResult> => ({
        h5_url: `mock://${label}/${o.orderNo}`,
        expire_at: new Date('2030-01-01T00:00:00Z'),
      })),
    };
    return svc;
  }

  it('routes PaymentMethod.WECHAT to the Wechat provider', async () => {
    const wechat = makeProvider('wechat');
    const alipay = makeProvider('alipay');
    const router = new PaymentRouterService(wechat, alipay);

    const result = await router.createPayUrl(PaymentMethod.WECHAT, order);

    expect(wechat.createPayUrl).toHaveBeenCalledWith(order);
    expect(alipay.createPayUrl).not.toHaveBeenCalled();
    expect(result.h5_url).toBe('mock://wechat/O1');
  });

  it('routes PaymentMethod.ALIPAY to the Alipay provider', async () => {
    const wechat = makeProvider('wechat');
    const alipay = makeProvider('alipay');
    const router = new PaymentRouterService(wechat, alipay);

    const result = await router.createPayUrl(PaymentMethod.ALIPAY, order);

    expect(alipay.createPayUrl).toHaveBeenCalledWith(order);
    expect(wechat.createPayUrl).not.toHaveBeenCalled();
    expect(result.h5_url).toBe('mock://alipay/O1');
  });

  it('throws BadRequestException for an unknown method', async () => {
    const router = new PaymentRouterService(
      makeProvider('wechat'),
      makeProvider('alipay'),
    );

    await expect(
      router.createPayUrl('bitcoin' as unknown as PaymentMethod, order),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getService returns the same provider instance used by createPayUrl', () => {
    const wechat = makeProvider('wechat');
    const alipay = makeProvider('alipay');
    const router = new PaymentRouterService(wechat, alipay);

    expect(router.getService(PaymentMethod.WECHAT)).toBe(wechat);
    expect(router.getService(PaymentMethod.ALIPAY)).toBe(alipay);
  });
});
