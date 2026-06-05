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

/**
 * Per-user acceptance record of a specific agreement version. The unique
 * constraint on (user_id, type, version) enforces idempotent acceptance;
 * a user must re-accept only when the version bumps.
 */
@Entity('user_agreements')
@Index('uq_user_agreements_user_type_version', ['userId', 'type', 'version'], { unique: true })
export class UserAgreement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (u) => u.agreements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'type', type: 'varchar', length: 32 })
  type!: string;

  @Column({ name: 'version', type: 'varchar', length: 32 })
  version!: string;

  @CreateDateColumn({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt!: Date;
}
