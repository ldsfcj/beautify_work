import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { PaymentService } from '../payment/payment.service';
import { PAYMENT_ROUTER, PaymentRouter } from '../payment/payment.types';

/**
 * Daily 02:00 reconcile job. We trust provider push notifications
 * for the happy path (PaymentService.handleXxxNotify) but the
 * internet drops packets and providers occasionally swallow callbacks,
 * so this cron sweeps every order that has been `pending` for more
 * than 30 minutes and asks the provider directly. SUCCESS → settle
 * through PaymentService.creditOrderFromReconcile so the ledger /
 * status write path is identical to the notify path. Anything else
 * → a console.warn for now; the proper alerting wire-up lands in
 * Task 24 (search for "Task 24" to find the swap-in site).
 *
 * Why 30 minutes: the create-pay URL we hand to the user expires
 * 30 minutes after issue (see WechatPaymentService.EXPIRE_MINUTES);
 * orders older than that with no `paid_at` cannot succeed without
 * provider-side intervention. Scanning earlier would race the user
 * still on the checkout page; later would let entries pile up.
 */
@Injectable()
export class DailyReconcileCron {
  private readonly logger = new Logger(DailyReconcileCron.name);
  private static readonly STALE_MINUTES = 30;

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @Inject(PAYMENT_ROUTER) private readonly router: PaymentRouter,
    private readonly payment: PaymentService,
  ) {}

  @Cron('0 2 * * *', { name: 'dailyReconcile' })
  async reconcile(): Promise<{
    scanned: number;
    credited: number;
    warned: number;
  }> {
    const cutoff = new Date(
      Date.now() - DailyReconcileCron.STALE_MINUTES * 60_000,
    );
    const stale = await this.orders.find({
      where: { status: OrderStatus.PENDING, createdAt: LessThan(cutoff) },
    });

    let credited = 0;
    let warned = 0;

    for (const order of stale) {
      const method = order.paymentMethod;
      if (!method) {
        // User abandoned at the method-picker — no provider to ask.
        // TODO(Task 24): notification.warn instead of console.warn.
        console.warn(
          `[reconcile] order ${order.orderNo} stuck pending with no paymentMethod`,
        );
        warned++;
        continue;
      }

      try {
        const provider = this.router.getService(method);
        const result = await provider.queryOrder(order.orderNo);

        if (result.tradeState === 'SUCCESS') {
          await this.payment.creditOrderFromReconcile(
            order,
            method,
            result.transactionId ?? '',
          );
          credited++;
          this.logger.log(
            `[reconcile] credited order ${order.orderNo} via ${method}`,
          );
        } else {
          // TODO(Task 24): notification.warn instead of console.warn.
          console.warn(
            `[reconcile] order ${order.orderNo} stuck pending: trade_state=${result.tradeState}`,
          );
          warned++;
        }
      } catch (e: any) {
        // Per-order failure must not abort the rest of the batch.
        console.warn(
          `[reconcile] order ${order.orderNo} errored: ${e?.message ?? e}`,
        );
        warned++;
      }
    }

    this.logger.log(
      `[reconcile] done: scanned=${stale.length} credited=${credited} warned=${warned}`,
    );
    return { scanned: stale.length, credited, warned };
  }
}
