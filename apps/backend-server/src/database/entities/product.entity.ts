import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProductStatus } from '@hyperzod/shared-types';
import { bigintTransformer } from '../transformers';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Integer minor units. Never a float, never a decimal string. */
  @Column({
    name: 'price_amount_cents',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  priceAmountCents: number;

  /** Inherited from `tenants.default_currency_code` at write time. */
  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode: string;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status',
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
