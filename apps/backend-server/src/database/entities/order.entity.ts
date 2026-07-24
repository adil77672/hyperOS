import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { OrderFulfillmentType, OrderStatus } from '@hyperzod/shared-types';
import { bigintTransformer } from '../transformers';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  /** Null for guest orders — customer accounts are Phase 2. */
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  @Column({ name: 'order_number', type: 'text' })
  orderNumber: string;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status', default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({
    name: 'fulfillment_type',
    type: 'enum',
    enum: OrderFulfillmentType,
    enumName: 'order_fulfillment_type',
  })
  fulfillmentType: OrderFulfillmentType;

  @Column({ name: 'subtotal_cents', type: 'bigint', default: 0, transformer: bigintTransformer })
  subtotalCents: number;

  @Column({ name: 'delivery_fee_cents', type: 'bigint', default: 0, transformer: bigintTransformer })
  deliveryFeeCents: number;

  @Column({ name: 'tax_cents', type: 'bigint', default: 0, transformer: bigintTransformer })
  taxCents: number;

  @Column({ name: 'discount_cents', type: 'bigint', default: 0, transformer: bigintTransformer })
  discountCents: number;

  @Column({ name: 'total_cents', type: 'bigint', default: 0, transformer: bigintTransformer })
  totalCents: number;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode: string;

  @Column({ name: 'customer_full_name', type: 'text' })
  customerFullName: string;

  @Column({ name: 'customer_contact_email', type: 'citext' })
  customerContactEmail: string;

  @Column({ name: 'customer_contact_phone', type: 'text' })
  customerContactPhone: string;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'placed_at', type: 'timestamptz' })
  placedAt: Date;

  // Lifecycle timestamps below are written by the enforce_order_status_transition
  // trigger, never by the application — that keeps them from drifting off status.

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  readyAt: Date | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
