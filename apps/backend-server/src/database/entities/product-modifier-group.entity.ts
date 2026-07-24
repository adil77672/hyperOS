import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ModifierSelectionType } from '@hyperzod/shared-types';

@Entity('product_modifier_groups')
export class ProductModifierGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({
    name: 'selection_type',
    type: 'enum',
    enum: ModifierSelectionType,
    enumName: 'modifier_selection_type',
  })
  selectionType: ModifierSelectionType;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ name: 'min_selections', type: 'int', default: 0 })
  minSelections: number;

  @Column({ name: 'max_selections', type: 'int', default: 1 })
  maxSelections: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
