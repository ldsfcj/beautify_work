import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Generation } from './generation.entity';

/**
 * Per-call record of an AI model invocation. Used for cost monitoring
 * (sum costCents by model/day) and incident forensics (latency + error
 * correlation when the model degrades).
 */
@Entity('ai_call_logs')
export class AiCallLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (u) => u.aiCallLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'generation_id', type: 'uuid' })
  generationId!: string;

  @ManyToOne(() => Generation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_id' })
  generation!: Generation;

  @Column({ name: 'model', type: 'varchar', length: 64 })
  model!: string;

  @Column({ name: 'request_size', type: 'int', default: 0 })
  requestSize!: number;

  @Column({ name: 'response_size', type: 'int', default: 0 })
  responseSize!: number;

  @Column({ name: 'cost_cents', type: 'int', default: 0 })
  costCents!: number;

  @Column({ name: 'latency_ms', type: 'int', default: 0 })
  latencyMs!: number;

  @Column({ name: 'success', type: 'boolean', default: false })
  success!: boolean;

  @Column({ name: 'error_code', type: 'varchar', length: 32, nullable: true })
  errorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
