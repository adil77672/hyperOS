import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from '@hyperzod/shared-types';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Unique per tenant, NOT globally — two tenants may share an owner email. */
  @Column({ type: 'citext' })
  email: string;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  /** Nullable to support future SSO-only users. */
  @Column({ name: 'password_hash', type: 'text', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ name: 'full_name', type: 'text' })
  fullName: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
