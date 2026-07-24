import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type {
  ThemeColors,
  ThemeHero,
  ThemeLayout,
  ThemeSocialLinks,
  ThemeTypography,
} from '@hyperzod/shared-types';

@Entity('tenant_themes')
export class TenantTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ name: 'favicon_url', type: 'text', nullable: true })
  faviconUrl: string | null;

  @Column({ name: 'hero_image_url', type: 'text', nullable: true })
  heroImageUrl: string | null;

  @Column({ name: 'about_text', type: 'text', nullable: true })
  aboutText: string | null;

  @Column({ type: 'jsonb' })
  colors: ThemeColors;

  @Column({ type: 'jsonb' })
  typography: ThemeTypography;

  @Column({ type: 'jsonb' })
  layout: ThemeLayout;

  @Column({ type: 'jsonb' })
  hero: ThemeHero;

  @Column({ name: 'social_links', type: 'jsonb' })
  socialLinks: ThemeSocialLinks;

  @Column({ name: 'legal_pages', type: 'jsonb' })
  legalPages: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
