import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';

/**
 * Snapshot of the modifiers selected on a line item. Names and prices are
 * copied, not referenced, so re-pricing the menu never rewrites history.
 * Immutable — no `updated_at`.
 */
@Entity('order_item_modifiers')
export class OrderItemModifier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId: string;

  @Column({ name: 'modifier_id', type: 'uuid', nullable: true })
  modifierId: string | null;

  @Column({ name: 'group_name', type: 'text' })
  groupName: string;

  @Column({ name: 'modifier_name', type: 'text' })
  modifierName: string;

  @Column({ name: 'delta_price_cents', type: 'bigint', transformer: bigintTransformer })
  deltaPriceCents: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
