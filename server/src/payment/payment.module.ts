import { Module } from '@nestjs/common';
import { MockPaymentService } from './payment.service';
import { PAYMENT_SERVICE } from './payment.types';

@Module({
  providers: [
    MockPaymentService,
    { provide: PAYMENT_SERVICE, useExisting: MockPaymentService },
  ],
  exports: [PAYMENT_SERVICE],
})
export class PaymentModule {}
