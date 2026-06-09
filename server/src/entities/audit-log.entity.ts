import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AdminUser } from './admin-user.entity';

/**
 * Back-office action log. Every write-side admin endpoint appends a
 * row here so the audit-logs page (and a future finance compliance
 * report) can answer "who changed X, when, with what payload?".
 *
 * `action` is a dotted namespace, e.g.
 *   `user.credit.adjust`
 *   `preset.create` / `preset.update` / `preset.soft_delete`
 *   `package.create` / `package.update` / `package.soft_delete`
 *   `refund.approve` / `refund.reject`
 *   `config.update`
 *   `payment.notify.bad_signature`     (Task 24 cleanup)
 *   `reconcile.warn`                   (Task 24 cleanup)
 *   `admin.login`                      (auth-service)
 *
 * `payload` is the request body or a compact summary — never the
 * full PII (e.g. for credit adjust, payload = { amount, reason };
 * the user's id is the targetId).
 */
@Entity('audit_logs')
@Index('ix_audit_logs_admin_created', ['adminId', 'createdAt'])
@Index('ix_audit_logs_action_created', ['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'admin_id', type: 'uuid' })
  adminId!: string;

  @ManyToOne(() => AdminUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin!: AdminUser | null;

  /** Dotted action name, e.g. `user.credit.adjust`. */
  @Column({ name: 'action', type: 'varchar', length: 64 })
  action!: string;

  /** Affected entity type, e.g. `user` | `preset` | `order` | `config`. */
  @Column({ name: 'target_type', type: 'varchar', length: 32, nullable: true })
  targetType!: string | null;

  /** Affected entity id (uuid, or null if not applicable). */
  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId!: string | null;

  /** Request body / change summary, JSONB so payloads can evolve. */
  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
