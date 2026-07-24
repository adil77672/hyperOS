import { ThemeDocument } from '@hyperzod/shared-types';
import { ApiException } from '../common/api-exception';
import { TenantTheme } from '../database/entities';
import { TenantContext } from '../tenancy/tenant-context';
import { UpdateThemeDto } from './dto/theme.dto';

/**
 * Curated font whitelist (PRODUCT_MAPPING §4.2).
 *
 * The storefront interpolates these straight into a CSS custom property, so an
 * arbitrary string here is a CSS injection. Rejecting anything off-list is the
 * mitigation, not escaping.
 */
export const ALLOWED_FONT_FAMILIES = [
  'Inter, system-ui, sans-serif',
  'Playfair Display, serif',
  'Lora, serif',
  'Merriweather, serif',
  'Poppins, sans-serif',
  'Montserrat, sans-serif',
  'Work Sans, sans-serif',
  'DM Sans, sans-serif',
  'Space Grotesk, sans-serif',
  'Source Serif 4, serif',
  'IBM Plex Sans, sans-serif',
  'Nunito, sans-serif',
] as const;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class ThemesService {
  constructor(private readonly cdnHost: string) {}

  async get(): Promise<ThemeDocument> {
    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const theme = await manager.findOne(TenantTheme, { where: { tenantId } });
    if (!theme) {
      // tenant_themes has UNIQUE(tenant_id) and signup always inserts one, so
      // a tenant without a theme means the row was deleted out from under us.
      throw ApiException.notFound('Theme');
    }
    return toDto(theme);
  }

  /** Whole-document replace (API_AND_EVENT_CONTRACTS §9). */
  async replace(dto: UpdateThemeDto): Promise<ThemeDocument> {
    this.validate(dto);

    const manager = TenantContext.requireManager();
    const tenantId = TenantContext.requireTenantId();

    const theme = await manager.findOne(TenantTheme, { where: { tenantId } });
    if (!theme) throw ApiException.notFound('Theme');

    theme.logoUrl = dto.logo_url ?? null;
    theme.faviconUrl = dto.favicon_url ?? null;
    theme.heroImageUrl = dto.hero_image_url ?? null;
    theme.aboutText = dto.about_text ?? null;
    theme.colors = dto.colors;
    theme.typography = dto.typography;
    theme.layout = dto.layout;
    theme.hero = dto.hero;
    theme.socialLinks = dto.social_links ?? {};

    await manager.save(TenantTheme, theme);
    return toDto(theme);
  }

  private validate(dto: UpdateThemeDto): void {
    for (const [key, value] of Object.entries(dto.colors)) {
      if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
        throw ApiException.validation(`colors.${key} must be a 6-digit hex colour.`, {
          field: `colors.${key}`,
        });
      }
    }

    for (const key of ['heading_font_family', 'body_font_family'] as const) {
      const family = dto.typography[key];
      if (!ALLOWED_FONT_FAMILIES.includes(family as (typeof ALLOWED_FONT_FAMILIES)[number])) {
        throw ApiException.validation(`typography.${key} is not an available font.`, {
          field: `typography.${key}`,
          allowed: ALLOWED_FONT_FAMILIES,
        });
      }
    }

    for (const [field, url] of [
      ['logo_url', dto.logo_url],
      ['favicon_url', dto.favicon_url],
      ['hero_image_url', dto.hero_image_url],
    ] as const) {
      if (url) this.assertOnPlatformCdn(field, url);
    }

    for (const [platform, url] of Object.entries(dto.social_links ?? {})) {
      if (url == null) continue;
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw ApiException.validation(`social_links.${platform} is not a valid URL.`, {
          field: `social_links.${platform}`,
        });
      }
      if (parsed.protocol !== 'https:') {
        throw ApiException.validation(`social_links.${platform} must be https.`, {
          field: `social_links.${platform}`,
        });
      }
    }
  }

  /**
   * PRODUCT_MAPPING §4.2: image URLs must be on the platform CDN. External
   * URLs are rejected — they leak referrers to third parties and rot silently.
   */
  private assertOnPlatformCdn(field: string, url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw ApiException.validation(`${field} is not a valid URL.`, { field });
    }

    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== this.cdnHost) {
      throw ApiException.validation(`${field} must be an https URL on ${this.cdnHost}.`, {
        field,
        expected_host: this.cdnHost,
      });
    }
  }
}

function toDto(theme: TenantTheme): ThemeDocument {
  return {
    logo_url: theme.logoUrl,
    favicon_url: theme.faviconUrl,
    hero_image_url: theme.heroImageUrl,
    about_text: theme.aboutText,
    colors: theme.colors,
    typography: theme.typography,
    layout: theme.layout,
    hero: theme.hero,
    social_links: theme.socialLinks,
  };
}
