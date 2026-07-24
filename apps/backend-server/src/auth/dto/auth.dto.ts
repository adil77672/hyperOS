import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid address' })
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  /**
   * Optional disambiguator. Emails are unique per tenant, not globally
   * (data dictionary §4.1), so one address can exist at several tenants.
   * Only needed when it actually does.
   */
  @IsOptional()
  @IsString()
  tenant_slug?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class SignupDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  business_name: string;

  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/, {
    message:
      'storefront_slug must be lowercase alphanumeric with internal hyphens, 3-63 characters',
  })
  storefront_slug: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  owner_full_name: string;

  @IsEmail()
  owner_email: string;

  @IsString()
  @MinLength(12, { message: 'owner_password must be at least 12 characters' })
  @MaxLength(256)
  owner_password: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'contact_phone must be E.164, e.g. +61400000000' })
  contact_phone?: string;

  @IsOptional() @IsString()
  timezone?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'default_currency_code must be a 3-letter ISO 4217 code' })
  default_currency_code?: string;

  @IsOptional() @IsString()
  default_locale?: string;
}
