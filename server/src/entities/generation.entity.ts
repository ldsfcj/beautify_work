import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum GenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
}

/**
 * A single AI preview generation request. `presetKeys` stores the array of
 * preset identifiers chosen (e.g. `["rhinoplasty_natural","lip_fill"]`).
 * `resultUrl` is the OSS key for the generated image. `expiresAt` enforces
 * the 30-day privacy retention policy (D6).
 */
@Entity('generations')
export class Generation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (u) => u.generations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'original_url', type: 'text' })
  originalUrl!: string;

  @Column({ name: 'result_url', type: 'text', nullable: true })
  resultUrl!: string | null;

  @Column({ name: 'preset_keys', type: 'text', array: true, default: '{}' })
  presetKeys!: string[];

  @Column({ name: 'prompt_text', type: 'text' })
  promptText!: string;

  @Column({ name: 'model_used', type: 'varchar', length: 64, nullable: true })
  modelUsed!: string | null;

  @Column({ name: 'credits_cost', type: 'int' })
  creditsCost!: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: GenerationStatus,
    default: GenerationStatus.PENDING,
  })
  status!: GenerationStatus;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  errorMsg!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
