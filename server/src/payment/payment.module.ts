import { Module } from '@nestjs/common';
import { WechatPaymentService } from './wechat/wechat-payment.service';
import { PAYMENT_SERVICE } from './payment.types';

@Module({
  providers: [
    WechatPaymentService,
    { provide: PAYMENT_SERVICE, useExisting: WechatPaymentService },
  ],
  exports: [PAYMENT_SERVICE],
})
export class PaymentModule {}
