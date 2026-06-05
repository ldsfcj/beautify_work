import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Order, OrderStatus, PaymentMethod } from '../entities/order.entity';
import { CreditPackage } from '../entities/credit-package.entity';
import { User } from '../entities/user.entity';
import { PAYMENT_ROUTER, PaymentRouter } from '../payment/payment.types';

/** Pagination caps — prevents a client from asking for 10k orders. */
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * Order lifecycle: pending → (paid | cancelled | refunded). Created
 * by `create()`, fulfilled by the payment-callback handler (Task 18),
 * inspected via `list()` / `detail()`. The credit top-up happens in
 * the callback, not here — `create()` only persists the order and
 * asks the payment provider for a checkout URL.
 */
@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(CreditPackage) private readonly packages: Repository<CreditPackage>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(PAYMENT_ROUTER) private readonly payment: PaymentRouter,
  ) {}

  /**
   * Create a pending order. Validates the package (must exist + be
   * active) and the payment method, then persists the order and
   * asks the payment provider for an H5 checkout URL. The order
   * row carries the denormalised `credits` (= pkg + bonus) and
   * `amountCents` (= pkg price) so the callback handler doesn't
   * have to re-join the package table.
   */
  async create(
    userId: string,
    packageId: string,
    method: PaymentMethod,
  ): Promise<{
    order_no: string;
    credits: number;
    amount_cents: number;
    h5_url: string;
    expire_at: string;
  }> {
    if (!Object.values(PaymentMethod).includes(method)) {
      throw new BadRequestException(`不支持的支付方式: ${method}`);
    }
    const pkg = await this.packages.findOneBy({ id: packageId, isActive: true });
    if (!pkg) {
      throw new NotFoundException(`套餐 ${packageId} 不存在或已下架`);
    }

    const orderNo = this.generateOrderNo();
    const credits = pkg.credits + pkg.bonusCredits;
    const order = await this.orders.save(
      this.orders.create({
        orderNo,
        userId,
        packageId: pkg.id,
        credits,
        amountCents: pkg.priceCents,
        status: OrderStatus.PENDING,
        paymentMethod: method,
      }),
    );

    const pay = await this.payment.createPayUrl(method, order);
    return {
      order_no: order.orderNo,
      credits,
      amount_cents: order.amountCents,
      h5_url: pay.h5_url,
      expire_at: pay.expire_at.toISOString(),
    };
  }

  /**
   * Paginated list of the requesting user's orders. `page` is
   * 1-indexed; `size` defaults to 10 and is capped at 100 to avoid
   * runaway queries. Undefined / non-integer inputs are coerced to
   * the defaults; 0 or negative page resets to 1; 0 size falls
   * back to the default (10).
   */
  async list(
    userId: string,
    page: number = 1,
    size: number = DEFAULT_PAGE_SIZE,
  ): Promise<{
    items: Order[];
    total: number;
    page: number;
    size: number;
  }> {
    const safePage =
      Number.isInteger(page) && page > 0 ? page : 1;
    const safeSize = Number.isInteger(size) && size > 0
      ? Math.min(MAX_PAGE_SIZE, size)
      : DEFAULT_PAGE_SIZE;
    const [items, total] = await this.orders.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    });
    return { items, total, page: safePage, size: safeSize };
  }

  /**
   * Order detail. The ownership check is the security boundary —
   * never let user A peek at user B's order_no (which would let
   * them bypass the payment flow). 404 (not 403) on ownership
   * miss avoids confirming the order exists.
   */
  async detail(userId: string, orderNo: string): Promise<Order> {
    const order = await this.orders.findOne({ where: { orderNo } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException(`订单 ${orderNo} 不存在`);
    }
    return order;
  }

  /**
   * 12-char base64url random suffix after a fixed `M` prefix.
   * `M` keeps the format human-greppable in logs; base64url is
   * URL-safe and unambiguous. ~71 bits of entropy is plenty for
   * an e-commerce order id (birthday-paradox collisions only
   * matter past ~4 billion orders).
   */
  private generateOrderNo(): string {
    return 'M' + randomBytes(9).toString('base64url');
  }
}
