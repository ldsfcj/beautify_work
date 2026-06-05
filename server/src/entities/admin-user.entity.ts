import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum AdminRole {
  ADMIN = 'admin',
  SUPER = 'super',
}

/**
 * Internal staff account. Lives in a separate table from `users` so the
 * customer auth path can never accidentally grant admin access. The
 * super role bypasses per-permission checks (e.g. refund approval over
 * the configured limit).
 */
@Entity('admin_users')
@Index('uq_admin_users_username', ['username'], { unique: true })
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'username', type: 'varchar', length: 32, unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 128 })
  passwordHash!: string;

  @Column({
    name: 'role',
    type: 'enum',
    enum: AdminRole,
    default: AdminRole.ADMIN,
  })
  role!: AdminRole;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
