import { Request } from 'express';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

/**
 * Unit tests for the PaymentController. The controller is a thin
 * adapter: pull raw body off the request, hand it to PaymentService,
 * format the response in the shape each provider requires (XML for
 * Wechat, plain "success" for Alipay).
 *
 * Coverage:
 *   1. Wechat happy path → calls service.handleWechatNotify with the
 *      raw req.body string and the headers, returns SUCCESS XML.
 *   2. Wechat failure XML (provider didn't ack OK) → returns FAIL XML.
 *   3. Alipay happy path → re-serialises req.body object to
 *      url-encoded raw string, returns "success".
 *   4. Alipay url-encoded special chars survive the round trip.
 */
describe('PaymentController', () => {
  let controller: PaymentController;
  let service: jest.Mocked<
    Pick<PaymentService, 'handleWechatNotify' | 'handleAlipayNotify'>
  >;

  beforeEach(() => {
    service = {
      handleWechatNotify: jest.fn(),
      handleAlipayNotify: jest.fn(),
    } as any;
    controller = new PaymentController(service as unknown as PaymentService);
  });

  describe('wechatNotify', () => {
    it('passes raw XML + headers to the service and wraps the SUCCESS reply', async () => {
      service.handleWechatNotify.mockResolvedValue({
        code: 'SUCCESS',
        message: 'OK',
      });
      const req = {
        body: '<xml><out_trade_no>O1</out_trade_no></xml>',
        headers: { 'x-mock-sign': 'ok', 'content-type': 'application/xml' },
      } as unknown as Request;

      const xml = await controller.wechatNotify(req);

      expect(service.handleWechatNotify).toHaveBeenCalledWith(
        '<xml><out_trade_no>O1</out_trade_no></xml>',
        req.headers,
      );
      expect(xml).toContain('<return_code><![CDATA[SUCCESS]]></return_code>');
      expect(xml).toContain('<return_msg><![CDATA[OK]]></return_msg>');
    });

    it('serialises a FAIL ack into the matching XML envelope', async () => {
      service.handleWechatNotify.mockResolvedValue({
        code: 'FAIL',
        message: 'bad',
      });
      const xml = await controller.wechatNotify({
        body: '<xml/>',
        headers: {},
      } as unknown as Request);

      expect(xml).toContain('<return_code><![CDATA[FAIL]]></return_code>');
      expect(xml).toContain('<return_msg><![CDATA[bad]]></return_msg>');
    });

    it('handles non-string body by sending an empty string to the service', async () => {
      // Defensive: if the body parser isn't mounted the body may be
      // undefined or an object; controller must not crash, and the
      // empty body lets the service fail signature check cleanly.
      service.handleWechatNotify.mockResolvedValue({
        code: 'SUCCESS',
        message: 'OK',
      });
      await controller.wechatNotify({
        body: undefined,
        headers: {},
      } as unknown as Request);
      expect(service.handleWechatNotify).toHaveBeenCalledWith(
        '',
        expect.any(Object),
      );
    });
  });

  describe('alipayNotify', () => {
    it('re-serialises the parsed body to url-encoded raw and returns "success"', async () => {
      service.handleAlipayNotify.mockResolvedValue('success');
      const req = {
        body: {
          out_trade_no: 'O1',
          trade_no: 'TX1',
          trade_status: 'TRADE_SUCCESS',
        },
        headers: { 'x-mock-sign': 'ok' },
      } as unknown as Request;

      const ack = await controller.alipayNotify(req);

      expect(ack).toBe('success');
      const [rawBody, headers] = service.handleAlipayNotify.mock.calls[0];
      expect(headers).toEqual(req.headers);
      // URLSearchParams stringification is order-preserving (insertion order
      // since ES2015), so the resulting raw body decodes to the same fields.
      const round = new URLSearchParams(rawBody);
      expect(round.get('out_trade_no')).toBe('O1');
      expect(round.get('trade_no')).toBe('TX1');
      expect(round.get('trade_status')).toBe('TRADE_SUCCESS');
    });

    it('special characters in body values survive url-encoding round-trip', async () => {
      service.handleAlipayNotify.mockResolvedValue('success');
      const req = {
        body: { out_trade_no: 'O/1', trade_no: 'TX 1' },
        headers: {},
      } as unknown as Request;

      await controller.alipayNotify(req);

      const [rawBody] = service.handleAlipayNotify.mock.calls[0];
      const round = new URLSearchParams(rawBody);
      expect(round.get('out_trade_no')).toBe('O/1');
      expect(round.get('trade_no')).toBe('TX 1');
    });

    it('returns "fail" verbatim when the service signals a failure', async () => {
      service.handleAlipayNotify.mockResolvedValue('fail');
      const ack = await controller.alipayNotify({
        body: {},
        headers: {},
      } as unknown as Request);
      expect(ack).toBe('fail');
    });
  });
});
