/**
 * Wire-format shapes from API_AND_EVENT_CONTRACTS.md.
 *
 * Field names are snake_case because they are JSON payload keys, not TS
 * identifiers — matching the document verbatim so a mismatch is a diff, not a
 * judgement call. All money is integer cents. All timestamps are ISO 8601.
 */
import {
  MerchantStatus,
  ModifierSelectionType,
  OrderFulfillmentType,
  OrderStatus,
  ProductStatus,
  UserRole,
} from './enums';

/* ------------------------------------------------------------------ theme */

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
  danger: string;
  success: string;
}

export interface ThemeTypography {
  heading_font_family: string;
  body_font_family: string;
  base_font_size_px: number;
  heading_weight: number;
  body_weight: number;
}

export interface ThemeLayout {
  border_radius_px: number;
  container_max_width_px: number;
}

export interface ThemeHero {
  style: 'IMAGE_WITH_OVERLAY' | 'SOLID' | 'MINIMAL';
  overlay_opacity: number;
  heading_text?: string | null;
  subheading_text?: string | null;
}

export interface ThemeSocialLinks {
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  x?: string | null;
  youtube?: string | null;
}

export interface ThemeDocument {
  logo_url: string | null;
  favicon_url: string | null;
  hero_image_url: string | null;
  about_text: string | null;
  colors: ThemeColors;
  typography: ThemeTypography;
  layout: ThemeLayout;
  hero: ThemeHero;
  social_links: ThemeSocialLinks;
}

/* ------------------------------------------------------------------- auth */

export interface AuthUserDto {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

export interface AuthSessionDto {
  user: AuthUserDto;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface JwtClaims {
  sub: string;
  tenantId: string;
  role: UserRole;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/* ------------------------------------------------------------- storefront */

export interface StorefrontTenantDto {
  id: string;
  name: string;
  slug: string;
  default_currency_code: string;
  default_locale: string;
  timezone: string;
}

export interface StorefrontMerchantDto {
  id: string;
  name: string;
  description: string | null;
  accepting_orders: boolean;
  avg_prep_minutes: number;
  contact_phone: string | null;
  status: MerchantStatus;
}

export interface StorefrontSessionDto {
  id: string;
  csrf_token: string;
}

export interface StorefrontBootstrapDto {
  tenant: StorefrontTenantDto;
  merchant: StorefrontMerchantDto | null;
  theme: ThemeDocument;
  session: StorefrontSessionDto;
}

export interface ModifierDto {
  id: string;
  name: string;
  delta_price_cents: number;
  is_default: boolean;
  sort_order: number;
}

export interface ModifierGroupDto {
  id: string;
  name: string;
  selection_type: ModifierSelectionType;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  modifiers: ModifierDto[];
}

export interface ProductDto {
  id: string;
  name: string;
  description: string | null;
  price_amount_cents: number;
  currency_code: string;
  status: ProductStatus;
  image_url: string | null;
  sort_order: number;
  modifier_groups: ModifierGroupDto[];
}

export interface CategoryDto {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  products: ProductDto[];
}

export interface MenuDto {
  categories: CategoryDto[];
}

/* ------------------------------------------------------------------- cart */

export interface CartItemInput {
  product_id: string;
  quantity: number;
  selected_modifier_ids: string[];
  notes?: string | null;
}

export interface CartSelectedModifierDto {
  id: string;
  group_name: string;
  name: string;
  delta_price_cents: number;
}

export interface CartItemDto {
  line_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  selected_modifiers: CartSelectedModifierDto[];
  unit_price_cents: number;
  line_total_cents: number;
  notes: string | null;
}

export interface CartDto {
  items: CartItemDto[];
  subtotal_cents: number;
  delivery_fee_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  currency_code: string;
}

/* ----------------------------------------------------------------- orders */

export interface OrderCustomerDto {
  full_name: string;
  contact_email: string;
  contact_phone: string;
}

export interface OrderItemModifierDto {
  group_name: string;
  modifier_name: string;
  delta_price_cents: number;
}

export interface OrderItemDto {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  notes: string | null;
  modifiers: OrderItemModifierDto[];
}

export interface OrderDto {
  id: string;
  order_number: string;
  status: OrderStatus;
  fulfillment_type: OrderFulfillmentType;
  subtotal_cents: number;
  delivery_fee_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  currency_code: string;
  customer: OrderCustomerDto;
  delivery_address: string | null;
  notes: string | null;
  placed_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: OrderItemDto[];
}

export interface CheckoutRequestDto {
  fulfillment_type: OrderFulfillmentType;
  customer: OrderCustomerDto;
  delivery_address?: string | null;
  notes?: string | null;
  items: CartItemInput[];
}

/* -------------------------------------------------------------------- SSE */

export const SSE_EVENT_ORDER_CREATED = 'order.created';
export const SSE_EVENT_ORDER_STATUS_CHANGED = 'order.status_changed';
export const SSE_EVENT_CATCHUP_GAP = 'catchup_gap';

/** API_AND_EVENT_CONTRACTS.md §5.3 — deliberately compact. */
export interface OrderCreatedEventData {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  fulfillment_type: OrderFulfillmentType;
  total_cents: number;
  currency_code: string;
  placed_at: string;
  customer_full_name: string;
  item_count: number;
}

/** API_AND_EVENT_CONTRACTS.md §5.4. */
export interface OrderStatusChangedEventData {
  order_id: string;
  order_number: string;
  previous_status: OrderStatus;
  new_status: OrderStatus;
  changed_at: string;
}

export interface SseEnvelope<T = unknown> {
  id: string;
  event: string;
  data: T;
}
