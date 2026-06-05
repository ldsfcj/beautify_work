import { Controller, Header, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { PaymentService } from './payment.service';
import { NotifyHeaders } from './payment.types';

/**
 * Payment-provider callback endpoints. Both routes are `@Public()`
 * because the provider authenticates via signature (verified inside
 * PaymentService), not via our JWT — and `@SkipTransform()` because
 * each provider demands its own response shape (Wechat: XML envelope;
 * Alipay: the bare string `"success"`). The global TransformInterceptor
 * would wrap them in `{code, message, data}` otherwise.
 *
 * Body parsers (mounted in main.ts):
 *   - Wechat: `text/xml` / `application/xml` → req.body is a string.
 *   - Alipay: `application/x-www-form-urlencoded` (Express default) →
 *     req.body is a flat object; we re-serialise it so the service /
 *     provider keep working off a raw string body (which is what real
 *     signature verification will need anyway).
 */
@Controller('payment')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Public()
  @SkipTransform()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Post('wechat/notify')
  async wechatNotify(@Req() req: Request): Promise<string> {
    const rawBody = typeof req.body === 'string' ? req.body : '';
    const ack = await this.service.handleWechatNotify(
      rawBody,
      req.headers as NotifyHeaders,
    );
    return (
      '<xml>' +
      `<return_code><![CDATA[${ack.code}]]></return_code>` +
      `<return_msg><![CDATA[${ack.message}]]></return_msg>` +
      '</xml>'
    );
  }

  @Public()
  @SkipTransform()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Post('alipay/notify')
  async alipayNotify(@Req() req: Request): Promise<string> {
    // Express's urlencoded parser populates req.body as a flat object.
    // Re-encode it back to the canonical raw string so the provider's
    // verifySign / decodeNotify can work off a single body shape.
    const parsed = (req.body ?? {}) as Record<string, string>;
    const rawBody = new URLSearchParams(parsed).toString();
    return this.service.handleAlipayNotify(
      rawBody,
      req.headers as NotifyHeaders,
    );
  }
}
