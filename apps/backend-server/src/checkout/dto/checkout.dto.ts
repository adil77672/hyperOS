import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderFulfillmentType } from '@hyperzod/shared-types';
import { MAX_LINE_QUANTITY } from '../../catalog/pricing';

/** A cart line as the client may express it: ids and quantities, never prices. */
export class CartItemInputDto {
  @IsUUID('4')
  product_id: string;

  @IsInt() @Min(1) @Max(MAX_LINE_QUANTITY)
  quantity: number;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  selected_modifier_ids: string[] = [];

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string | null;
}

export class ReplaceCartDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemInputDto)
  items: CartItemInputDto[];
}

export class CustomerDetailsDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  full_name: string;

  @IsEmail()
  contact_email: string;

  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'contact_phone must be in E.164 format, e.g. +61400111222',
  })
  contact_phone: string;
}

export class CheckoutDto {
  @IsEnum(OrderFulfillmentType)
  fulfillment_type: OrderFulfillmentType;

  @ValidateNested() @Type(() => CustomerDetailsDto)
  customer: CustomerDetailsDto;

  /** Required when fulfillment_type is DELIVERY; enforced in the service. */
  @IsOptional() @IsString() @MaxLength(500)
  delivery_address?: string | null;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'An order needs at least one item.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemInputDto)
  items: CartItemInputDto[];
}
