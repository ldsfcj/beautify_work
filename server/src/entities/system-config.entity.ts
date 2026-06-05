import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Singleton key-value config store. `value` is JSONB so complex shapes
 * (e.g. AI model selection matrix, prompt prefix/suffix) can be stored
 * without schema changes. Used for everything that needs to be tunable
 * from the admin panel without code deploys (D8).
 */
@Entity('system_configs')
export class SystemConfig {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 64 })
  key!: string;

  @Column({ name: 'value', type: 'jsonb' })
  value!: unknown;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, default: 'system' })
  updatedBy!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
