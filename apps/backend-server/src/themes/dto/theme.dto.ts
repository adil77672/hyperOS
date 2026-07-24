import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  ThemeColors,
  ThemeHero,
  ThemeLayout,
  ThemeSocialLinks,
  ThemeTypography,
} from '@hyperzod/shared-types';

/**
 * Shape validation only. The semantic rules — hex format, font whitelist, CDN
 * host — live in ThemesService because they need configuration (the CDN host)
 * and produce the `details.field` shape API_AND_EVENT_CONTRACTS §9 specifies.
 */

class ColorsDto implements ThemeColors {
  @IsString() primary: string;
  @IsString() secondary: string;
  @IsString() accent: string;
  @IsString() background: string;
  @IsString() foreground: string;
  @IsString() muted: string;
  @IsString() border: string;
  @IsString() danger: string;
  @IsString() success: string;
}

class TypographyDto implements ThemeTypography {
  @IsString() heading_font_family: string;
  @IsString() body_font_family: string;

  @IsInt() @Min(12) @Max(24)
  base_font_size_px: number;

  @IsInt() @Min(100) @Max(900)
  heading_weight: number;

  @IsInt() @Min(100) @Max(900)
  body_weight: number;
}

class LayoutDto implements ThemeLayout {
  @IsInt() @Min(0) @Max(48)
  border_radius_px: number;

  @IsInt() @Min(640) @Max(2560)
  container_max_width_px: number;
}

class HeroDto implements ThemeHero {
  @IsIn(['IMAGE_WITH_OVERLAY', 'SOLID', 'MINIMAL'])
  style: 'IMAGE_WITH_OVERLAY' | 'SOLID' | 'MINIMAL';

  @IsNumber() @Min(0) @Max(1)
  overlay_opacity: number;

  @IsOptional() @IsString() @MaxLength(120)
  heading_text?: string | null;

  @IsOptional() @IsString() @MaxLength(240)
  subheading_text?: string | null;
}

export class UpdateThemeDto {
  @IsOptional() @IsString()
  logo_url?: string | null;

  @IsOptional() @IsString()
  favicon_url?: string | null;

  @IsOptional() @IsString()
  hero_image_url?: string | null;

  /** Plain text, no HTML — the storefront renders it as text, never as markup. */
  @IsOptional() @IsString() @MaxLength(4000)
  about_text?: string | null;

  @ValidateNested() @Type(() => ColorsDto)
  colors: ColorsDto;

  @ValidateNested() @Type(() => TypographyDto)
  typography: TypographyDto;

  @ValidateNested() @Type(() => LayoutDto)
  layout: LayoutDto;

  @ValidateNested() @Type(() => HeroDto)
  hero: HeroDto;

  @IsOptional() @IsObject()
  social_links?: ThemeSocialLinks;
}
