import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '@hyperzod/shared-types';

export class TransitionOrderDto {
  @IsEnum(OrderStatus)
  target_status: OrderStatus;

  /** Required for CANCELLED and DELIVERY_FAILED; enforced in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
