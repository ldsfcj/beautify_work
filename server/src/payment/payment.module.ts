import { Module } from '@nestjs/common';
import { WechatPaymentService } from './wechat/wechat-payment.service';
import { AlipayPaymentService } from './alipay/alipay-payment.service';
import { PaymentRouterService } from './payment.router';
import {
  ALIPAY_PAYMENT,
  PAYMENT_ROUTER,
  WECHAT_PAYMENT,
} from './payment.types';

@Module({
  providers: [
    WechatPaymentService,
    { provide: WECHAT_PAYMENT, useExisting: WechatPaymentService },
    AlipayPaymentService,
    { provide: ALIPAY_PAYMENT, useExisting: AlipayPaymentService },
    PaymentRouterService,
    { provide: PAYMENT_ROUTER, useExisting: PaymentRouterService },
  ],
  exports: [PAYMENT_ROUTER],
})
export class PaymentModule {}
