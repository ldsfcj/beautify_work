import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Order } from './order.entity';

/**
 * Credit package available for purchase. `credits` is the base amount and
 * `bonusCredits` is the promotional add-on; the user receives the sum on
 * successful payment. `validityDays` controls credit expiration.
 */
@Entity('credit_packages')
export class CreditPackage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 50 })
  name!: string;

  @Column({ name: 'credits', type: 'int' })
  credits!: number;

  @Column({ name: 'price_cents', type: 'int' })
  priceCents!: number;

  @Column({ name: 'bonus_credits', type: 'int', default: 0 })
  bonusCredits!: number;

  @Column({ name: 'validity_days', type: 'int' })
  validityDays!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @OneToMany(() => Order, (o) => o.package)
  orders!: Order[];
}
