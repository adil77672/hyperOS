import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('merchant_operating_hours')
export class MerchantOperatingHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  /** 0 = Sunday … 6 = Saturday. */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek: number;

  /** Merchant-local wall clock; the zone comes from `tenants.timezone`. */
  @Column({ name: 'opens_at', type: 'time' })
  opensAt: string;

  /** Earlier than `opens_at` means the window runs overnight (22:00 → 02:00). */
  @Column({ name: 'closes_at', type: 'time' })
  closesAt: string;
}
