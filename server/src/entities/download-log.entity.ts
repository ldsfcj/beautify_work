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
 * Audit record of every "download result image" action. Drives abuse
 * detection (e.g. > 50 downloads/hour) and proves consent chain for
 * any future data-subject request.
 */
@Entity('download_logs')
export class DownloadLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (u) => u.downloadLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'generation_id', type: 'uuid' })
  generationId!: string;

  @ManyToOne(() => Generation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_id' })
  generation!: Generation;

  @Column({ name: 'ip', type: 'varchar', length: 45 })
  ip!: string;

  @Column({ name: 'ua', type: 'text' })
  ua!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
