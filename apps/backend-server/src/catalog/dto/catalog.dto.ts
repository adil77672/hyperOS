import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ModifierSelectionType, ProductStatus } from '@hyperzod/shared-types';

/* --------------------------------------------------------------- category */

export class CreateCategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}

/* ---------------------------------------------------------------- product */

export class CreateProductDto {
  @IsOptional() @IsUUID('4')
  category_id?: string | null;

  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  /** Integer minor units. Currency is inherited, never sent (§8.1). */
  @IsInt() @Min(0)
  price_amount_cents: number;

  @IsOptional() @IsString() @MaxLength(1000)
  image_url?: string | null;

  @IsOptional() @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;
}

export class UpdateProductDto {
  @IsOptional() @IsUUID('4')
  category_id?: string | null;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsInt() @Min(0)
  price_amount_cents?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  image_url?: string | null;

  @IsOptional() @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;
}

/* ---------------------------------------------------------- modifier group */

export class CreateModifierGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @IsEnum(ModifierSelectionType)
  selection_type: ModifierSelectionType;

  @IsOptional() @IsBoolean()
  is_required?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(50)
  min_selections?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50)
  max_selections?: number;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;
}

export class UpdateModifierGroupDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsEnum(ModifierSelectionType)
  selection_type?: ModifierSelectionType;

  @IsOptional() @IsBoolean()
  is_required?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(50)
  min_selections?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50)
  max_selections?: number;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;
}

/* --------------------------------------------------------------- modifier */

export class CreateModifierDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  /** Signed — negative is valid (a size discount). */
  @IsInt()
  delta_price_cents: number;

  @IsOptional() @IsBoolean()
  is_default?: boolean;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;
}

export class UpdateModifierDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsInt()
  delta_price_cents?: number;

  @IsOptional() @IsBoolean()
  is_default?: boolean;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsInt() @Min(0)
  sort_order?: number;
}

/* ---------------------------------------------------- merchant settings */

export class UpdateMerchantSettingsDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsBoolean()
  accepting_orders?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(600)
  avg_prep_minutes?: number;

  @IsOptional() @IsString() @MaxLength(40)
  contact_phone?: string | null;
}
