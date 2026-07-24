import { Category } from './category.entity';
import { Merchant } from './merchant.entity';
import { MerchantOperatingHours } from './merchant-operating-hours.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderItemModifier } from './order-item-modifier.entity';
import { Product } from './product.entity';
import { ProductModifier } from './product-modifier.entity';
import { ProductModifierGroup } from './product-modifier-group.entity';
import { Tenant } from './tenant.entity';
import { TenantCustomDomain } from './tenant-custom-domain.entity';
import { TenantTheme } from './tenant-theme.entity';
import { User } from './user.entity';

export {
  Category,
  Merchant,
  MerchantOperatingHours,
  Order,
  OrderItem,
  OrderItemModifier,
  Product,
  ProductModifier,
  ProductModifierGroup,
  Tenant,
  TenantCustomDomain,
  TenantTheme,
  User,
};

export const ALL_ENTITIES = [
  Tenant,
  TenantTheme,
  TenantCustomDomain,
  User,
  Merchant,
  MerchantOperatingHours,
  Category,
  Product,
  ProductModifierGroup,
  ProductModifier,
  Order,
  OrderItem,
  OrderItemModifier,
];
