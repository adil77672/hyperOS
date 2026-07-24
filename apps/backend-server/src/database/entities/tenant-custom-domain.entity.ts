import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CustomDomainStatus } from '@hyperzod/shared-types';

/** Phase 2 (PRODUCT_MAPPING §1.1). Table exists in v1 so routing can read it. */
@Entity('tenant_custom_domains')
export class TenantCustomDomain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'citext' })
  hostname: string;

  @Column({
    type: 'enum',
    enum: CustomDomainStatus,
    enumName: 'custom_domain_status',
    default: CustomDomainStatus.PENDING_VERIFICATION,
  })
  status: CustomDomainStatus;

  @Column({ name: 'verification_token', type: 'text' })
  verificationToken: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'ssl_issued_at', type: 'timestamptz', nullable: true })
  sslIssuedAt: Date | null;

  @Column({ name: 'last_check_at', type: 'timestamptz', nullable: true })
  lastCheckAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
