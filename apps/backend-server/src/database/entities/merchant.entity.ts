import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MerchantStatus } from '@hyperzod/shared-types';

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'citext' })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: MerchantStatus,
    enumName: 'merchant_status',
    default: MerchantStatus.PENDING_APPROVAL,
  })
  status: MerchantStatus;

  @Column({ name: 'contact_phone', type: 'text', nullable: true })
  contactPhone: string | null;

  /** "Snooze new orders" switch (PRODUCT_MAPPING §1.5). */
  @Column({ name: 'accepting_orders', type: 'boolean', default: true })
  acceptingOrders: boolean;

  @Column({ name: 'avg_prep_minutes', type: 'int', default: 20 })
  avgPrepMinutes: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // `location` and `delivery_zone` are PostGIS geometry columns. They are
  // deliberately not mapped: nothing in Phase 1 reads them, and mapping
  // geometry through TypeORM would drag a WKB codec in for no benefit.
}
