import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TenantStatus } from '@hyperzod/shared-types';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'citext' })
  slug: string;

  @Column({ type: 'enum', enum: TenantStatus, enumName: 'tenant_status', default: TenantStatus.ACTIVE })
  status: TenantStatus;

  @Column({ name: 'default_currency_code', type: 'char', length: 3 })
  defaultCurrencyCode: string;

  @Column({ name: 'default_locale', type: 'text' })
  defaultLocale: string;

  @Column({ type: 'text' })
  timezone: string;

  @Column({ name: 'contact_email', type: 'citext' })
  contactEmail: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
