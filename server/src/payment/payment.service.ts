import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { CreditLedgerService } from '../credit/creditledger.service';
import { AuditService } from '../audit/audit.service';
import { Order, OrderStatus, PaymentMethod } from '../entities/order.entity';
import {
  NotifyHeaders,
  PAYMENT_ROUTER,
  PaymentRouter,
} from './payment.types';

/**
 * Bridge from raw notify payloads → ledger writes. Both Wechat and
 * Alipay funnel through `processNotify`; only the response shape
 * differs (Wechat wants `{code, message}`, Alipay wants the bare
 * string `'success'`).
 *
 * Failure-mode policy: return a success ack to the provider for
 * everything except a failed signature (which 400s). Returning
 * non-success would have the provider keep retrying the same notify,
 * which is harmless on idempotent recharge but spams logs and (for
 * Wechat) leaves the order open forever on the provider side.
 *
 * Bad signatures are written to the audit log (Task 24 cleanup) with
 * a sha256 of the raw body and a header subset, so an investigator
 * can correlate attacks across requests without us storing the full
 * payload.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(PAYMENT_ROUTER) private readonly router: PaymentRouter,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly ledger: CreditLedgerService,
    private readonly audit: AuditService,
  ) {}

  async handleWechatNotify(
    rawBody: string,
    headers: NotifyHeaders,
  ): Promise<{ code: 'SUCCESS' | 'FAIL'; message: string }> {
    await this.processNotify(PaymentMethod.WECHAT, rawBody, headers);
    return { code: 'SUCCESS', message: 'OK' };
  }

  async handleAlipayNotify(
    rawBody: string,
    headers: NotifyHeaders,
  ): Promise<'success' | 'fail'> {
    await this.processNotify(PaymentMethod.ALIPAY, rawBody, headers);
    return 'success';
  }

  /**
   * Shared notify pipeline:
   *   verify → decode → load order → idempotency / non-success short-circuit
   *   → recharge + flip status. Throws BadRequestException on signature
   *   failure or unknown order; returns void otherwise.
   *
   * Also called from the reconcile cron (Task 18) with a synthesised
   * body once the provider's queryOrder has confirmed a SUCCESS state.
   */
  async processNotify(
    method: PaymentMethod,
    rawBody: string,
    headers: NotifyHeaders,
  ): Promise<void> {
    const provider = this.router.getService(method);

    const verified = await provider.verifySign(rawBody, headers);
    if (!verified) {
      // Persist a forensic record: sha256(rawBody) + header subset, but
      // never the raw body (avoids storing attacker payloads in PG).
      const bodyHash = createHash('sha256').update(rawBody).digest('hex');
      await this.audit.write({
        adminId: '00000000-0000-0000-0000-000000000000', // system sentinel
        action: 'payment.notify.bad_signature',
        targetType: 'order',
        targetId: null,
        payload: {
          method,
          bodyHash,
          remoteIp: headers['x-forwarded-for'] ?? headers['remote-addr'] ?? null,
          ua: headers['user-agent'] ?? null,
        },
      });
      throw new BadRequestException('支付回调签名错误');
    }

    const data = await provider.decodeNotify(rawBody);

    const order = await this.orders.findOne({
      where: { orderNo: data.outTradeNo },
    });
    if (!order) {
      throw new BadRequestException(`订单不存在: ${data.outTradeNo}`);
    }

    if (order.status === OrderStatus.PAID) {
      // Duplicate notify — ledger / status already settled by an
      // earlier call. ACK without doing anything else.
      this.logger.log(`Duplicate notify for paid order ${order.orderNo}`);
      return;
    }

    if (data.tradeState !== 'SUCCESS') {
      // Provider may notify on non-terminal events (FAIL / CLOSED);
      // we ack but don't credit. Cron will mop up if the order ever
      // settles after a delay.
      this.logger.warn(
        `Notify trade_state=${data.tradeState} for order ${order.orderNo}; skipping recharge`,
      );
      return;
    }

    await this.creditOrderFromReconcile(order, method, data.transactionId);
  }

  /**
   * Settle a single order: append a recharge ledger row and flip
   * order.status to PAID. Shared by `processNotify` (provider push)
   * and the reconcile cron (active poll). Public so the cron can
   * call it directly without faking a notify payload — the caller
   * has already verified the source.
   *
   * Safe to call concurrently for distinct orders; concurrent calls
   * for the SAME order race on the ledger's row-level lock and
   * resolve to a single recharge (the second call will see the
   * already-PAID status on its next read; callers should pre-check
   * order.status to skip the entire transaction when possible).
   */
  async creditOrderFromReconcile(
    order: Order,
    method: PaymentMethod,
    txnId: string,
  ): Promise<void> {
    await this.ledger.recharge(order.userId, order.credits, order.orderNo);

    await this.orders.update(order.id, {
      status: OrderStatus.PAID,
      txnId,
      paidAt: new Date(),
      paymentMethod: method,
    });

    this.logger.log(
      `Credited ${order.credits} to user ${order.userId} for order ${order.orderNo} via ${method}`,
    );
  }
}
