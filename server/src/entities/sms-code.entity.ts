import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * The most-recent SMS verification code issued for a phone number. Each
 * send overwrites the previous row. Old rows are not retained for security;
 * expiry is enforced via `expiresAt` checked at verify time.
 */
@Entity('sms_codes')
export class SmsCode {
  @PrimaryColumn({ name: 'phone', type: 'varchar', length: 20 })
  phone!: string;

  @Column({ name: 'code', type: 'varchar', length: 8 })
  code!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used', type: 'boolean', default: false })
  used!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
