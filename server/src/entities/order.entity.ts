import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { CreditPackage } from './credit-package.entity';

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
}

/**
 * A user's purchase order for a credit package. `orderNo` is the
 * human-readable identifier shared with payment providers. Status drives
 * the credit top-up flow in OrderService.
 */
@Entity('orders')
@Index('uq_orders_order_no', ['orderNo'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_no', type: 'varchar', length: 32, unique: true })
  orderNo!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (u) => u.orders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId!: string;

  @ManyToOne(() => CreditPackage, (p) => p.orders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'package_id' })
  package!: CreditPackage;

  @Column({ name: 'credits', type: 'int' })
  credits!: number;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
  })
  paymentMethod!: PaymentMethod | null;

  @Column({ name: 'txn_id', type: 'varchar', length: 64, nullable: true })
  txnId!: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
