import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum LedgerType {
  RECHARGE = 'recharge',
  CONSUME = 'consume',
  REFUND = 'refund',
  ADMIN = 'admin',
}

/**
 * Append-only ledger of every credit balance change. The `amount` field
 * is signed: positive for additions (recharge/refund), negative for
 * deductions (consume). `balanceAfter` is denormalized for fast audit
 * queries (avoids replaying the full ledger).
 */
@Entity('credit_ledger')
export class CreditLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (u) => u.ledger, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'type',
    type: 'enum',
    enum: LedgerType,
  })
  type!: LedgerType;

  @Column({ name: 'amount', type: 'int' })
  amount!: number;

  @Column({ name: 'balance_after', type: 'int' })
  balanceAfter!: number;

  @Column({ name: 'related_id', type: 'varchar', length: 64, nullable: true })
  relatedId!: string | null;

  @Column({ name: 'note', type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
