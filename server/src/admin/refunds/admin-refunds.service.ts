import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { CreditLedgerService } from '../../credit/creditledger.service';
import { AuditService } from '../../audit/audit.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

export interface RefundsListQuery {
  page?: number;
  pageSize?: number;
  status?: RefundStatus | 'all';
}

export interface RefundsListResult {
  items: Array<Refund & { orderNo: string | null; userNickname: string | null }>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Back-office refund queue. Read + approve/reject; both write-side
 * transitions flip the order back to `refunded` and write a ledger
 * refund entry. Every action appends an audit log.
 *
 * Why an explicit refund entity (vs editing orders directly): the
 * refund flow needs to record a reason + the approving admin; folding
 * that onto `orders` would lose the audit trail once the row settles.
 */
@Injectable()
export class AdminRefundsService {
  constructor(
    @InjectRepository(Refund) private readonly refunds: Repository<Refund>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly credits: CreditLedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(query: RefundsListQuery = {}): Promise<RefundsListResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const qb = this.refunds
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.order', 'o')
      .leftJoinAndSelect('o.user', 'u')
      .orderBy('r.createdAt', 'DESC');

    if (query.status && query.status !== ('all' as RefundStatus)) {
      qb.andWhere('r.status = :st', { st: query.status });
    }

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [raw, total] = await qb.getManyAndCount();

    const items = raw.map((row) => {
      return {
        ...row,
        orderNo: row.order?.orderNo ?? null,
        userNickname: row.order?.user?.nickname ?? null,
      };
    });

    return { items, total, page, pageSize };
  }

  async approve(id: string, operator: JwtPayload): Promise<Refund> {
    const refund = await this.refunds.findOne({ where: { id } });
    if (!refund) throw new NotFoundException('退款单不存在');
    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException(`退款单状态非 PENDING (${refund.status})`);
    }
    const order = await this.orders.findOne({ where: { id: refund.orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(`订单状态非 PAID (${order.status})，无法退款`);
    }

    // Refund the user. The ledger writes a `type=refund` row with
    // relatedId = refund.id so the credit history stays self-explanatory.
    await this.credits.refund(
      refund.userId,
      order.credits,
      refund.id,
      `refund for order ${order.orderNo}`,
    );

    refund.status = RefundStatus.APPROVED;
    const saved = await this.refunds.save(refund);

    order.status = OrderStatus.REFUNDED;
    await this.orders.save(order);

    await this.audit.write({
      adminId: operator.id,
      action: 'refund.approve',
      targetType: 'refund',
      targetId: refund.id,
      payload: { orderNo: order.orderNo, credits: order.credits, userId: refund.userId },
    });

    return saved;
  }

  async reject(id: string, operator: JwtPayload, reason: string): Promise<Refund> {
    const refund = await this.refunds.findOne({ where: { id } });
    if (!refund) throw new NotFoundException('退款单不存在');
    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException(`退款单状态非 PENDING (${refund.status})`);
    }
    refund.status = RefundStatus.REJECTED;
    const saved = await this.refunds.save(refund);

    await this.audit.write({
      adminId: operator.id,
      action: 'refund.reject',
      targetType: 'refund',
      targetId: refund.id,
      payload: { reason },
    });

    return saved;
  }
}
