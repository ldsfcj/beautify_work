import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditModule } from '../credit/credit.module';
import { Order } from '../entities/order.entity';
import { WechatPaymentService } from './wechat/wechat-payment.service';
import { AlipayPaymentService } from './alipay/alipay-payment.service';
import { PaymentRouterService } from './payment.router';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import {
  ALIPAY_PAYMENT,
  PAYMENT_ROUTER,
  WECHAT_PAYMENT,
} from './payment.types';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), CreditModule],
  controllers: [PaymentController],
  providers: [
    WechatPaymentService,
    { provide: WECHAT_PAYMENT, useExisting: WechatPaymentService },
    AlipayPaymentService,
    { provide: ALIPAY_PAYMENT, useExisting: AlipayPaymentService },
    PaymentRouterService,
    { provide: PAYMENT_ROUTER, useExisting: PaymentRouterService },
    PaymentService,
  ],
  exports: [PAYMENT_ROUTER, PaymentService],
})
export class PaymentModule {}
