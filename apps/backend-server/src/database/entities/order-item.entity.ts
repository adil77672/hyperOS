import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';

/** Immutable once written — hence no `updated_at`. */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  /** SET NULL if the product is later deleted — the ledger is preserved. */
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ name: 'product_name', type: 'text' })
  productName: string;

  /** Snapshot; already includes every selected modifier delta. */
  @Column({ name: 'unit_price_cents', type: 'bigint', transformer: bigintTransformer })
  unitPriceCents: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'line_total_cents', type: 'bigint', transformer: bigintTransformer })
  lineTotalCents: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
