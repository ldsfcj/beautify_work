import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { CreditLedger } from './credit-ledger.entity';
import { Order } from './order.entity';
import { Generation } from './generation.entity';
import { AiCallLog } from './ai-call-log.entity';
import { DownloadLog } from './download-log.entity';
import { Refund } from './refund.entity';
import { UserAgreement } from './user-agreement.entity';
import { Notification } from './notification.entity';

export enum UserStatus {
  ACTIVE = 'active',
  BANNED = 'banned',
  PENDING_DELETE = 'pending_delete',
  DELETED = 'deleted',
}

/**
 * End user (consultant) record. Phone is stored as SHA-256 hash for lookup
 * and AES-encrypted ciphertext for recovery. Status drives the 30-day
 * soft-delete window before hard deletion (Task 11 cron).
 */
@Entity('users')
@Index('uq_users_phone_hash', ['phoneHash'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'phone_hash', type: 'varchar', length: 64, unique: true })
  phoneHash!: string;

  @Exclude({ toPlainOnly: true })
  @Column({ name: 'phone_encrypted', type: 'text' })
  phoneEncrypted!: string;

  @Column({ name: 'nickname', type: 'varchar', length: 50, nullable: true })
  nickname!: string | null;

  @Column({ name: 'avatar', type: 'text', nullable: true })
  avatar!: string | null;

  @Column({ name: 'credits', type: 'int', default: 0 })
  credits!: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'delete_at', type: 'timestamptz', nullable: true })
  deleteAt!: Date | null;

  @OneToMany(() => CreditLedger, (l) => l.user)
  ledger!: CreditLedger[];

  @OneToMany(() => Order, (o) => o.user)
  orders!: Order[];

  @OneToMany(() => Generation, (g) => g.user)
  generations!: Generation[];

  @OneToMany(() => AiCallLog, (a) => a.user)
  aiCallLogs!: AiCallLog[];

  @OneToMany(() => DownloadLog, (d) => d.user)
  downloadLogs!: DownloadLog[];

  @OneToMany(() => Refund, (r) => r.user)
  refunds!: Refund[];

  @OneToMany(() => UserAgreement, (a) => a.user)
  agreements!: UserAgreement[];

  @OneToMany(() => Notification, (n) => n.user)
  notifications!: Notification[];
}
