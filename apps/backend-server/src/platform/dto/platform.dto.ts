import { IsEnum } from 'class-validator';
import { TenantStatus } from '@hyperzod/shared-types';

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status!: TenantStatus;
}
