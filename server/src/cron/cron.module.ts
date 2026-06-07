import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { PaymentModule } from '../payment/payment.module';
import { CronController } from './cron.controller';
import { DailyReconcileCron } from './daily-reconcile.cron';

/**
 * Cron job container. `ScheduleModule.forRoot()` boots the discovery
 * service that wires `@Cron(...)`-decorated methods into the scheduler.
 *
 * The reconcile cron needs:
 *   - the Order repository (forFeature here; multiple modules holding
 *     the same forFeature is fine in TypeORM — they share the
 *     EntityManager);
 *   - PaymentModule for the PAYMENT_ROUTER token and PaymentService
 *     (the cron settles SUCCESS polls through
 *     `creditOrderFromReconcile`).
 *
 * `CronController` exposes a manual trigger at
 * `POST /api/admin/cron/run/dailyReconcile` for incident response
 * and Task 19 verification.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Order]),
    PaymentModule,
  ],
  controllers: [CronController],
  providers: [DailyReconcileCron],
})
export class CronModule {}
