import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Curated aesthetic procedure preset. `key` is the stable identifier the
 * frontend references (e.g. `rhinoplasty_natural`). `defaultPrompt` is the
 * base prompt fed to the AI model; the user can append custom text.
 */
@Entity('preset_items')
@Index('uq_preset_items_key', ['key'], { unique: true })
export class PresetItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'key', type: 'varchar', length: 64, unique: true })
  key!: string;

  @Column({ name: 'category', type: 'varchar', length: 32 })
  category!: string;

  @Column({ name: 'name', type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'default_prompt', type: 'text' })
  defaultPrompt!: string;

  @Column({ name: 'credits_cost', type: 'int' })
  creditsCost!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
