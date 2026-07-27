/**
 * Wire types mirroring the backend contracts (API_AND_EVENT_CONTRACTS.md).
 *
 * Kept local rather than importing @hyperzod/shared-types so the storefront can
 * be deployed as an independent app without the backend workspace present.
 * All money is integer cents; all ids are UUID strings.
 */

export type ModifierSelectionType = 'SINGLE' | 'MULTIPLE';
export type ProductStatus = 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED';
export type FulfillmentType = 'PICKUP' | 'DELIVERY';
export type OrderStatus =
  | 'PENDING'
  | 'MERCHANT_ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED';

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
  style: string;
  overlay_opacity: number;
  heading_text?: string | null;
  subheading_text?: string | null;
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
  social_links: Record<string, string | null>;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  default_currency_code: string;
  default_locale: string;
  timezone: string;
}
export interface Merchant {
  id: string;
  name: string;
  description: string | null;
  accepting_orders: boolean;
  avg_prep_minutes: number;
  contact_phone: string | null;
  status: string;
}
export interface Bootstrap {
  tenant: Tenant;
  merchant: Merchant | null;
  theme: ThemeDocument;
  session: { id: string; csrf_token: string };
}

export interface Modifier {
  id: string;
  name: string;
  delta_price_cents: number;
  is_default: boolean;
  sort_order: number;
}
export interface ModifierGroup {
  id: string;
  name: string;
  selection_type: ModifierSelectionType;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  modifiers: Modifier[];
}
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price_amount_cents: number;
  currency_code: string;
  status: ProductStatus;
  image_url: string | null;
  sort_order: number;
  modifier_groups: ModifierGroup[];
}
export interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  products: Product[];
}
export interface Menu {
  categories: Category[];
}

export interface CartItemInput {
  product_id: string;
  quantity: number;
  selected_modifier_ids: string[];
  notes?: string | null;
}
export interface CartSelectedModifier {
  id: string;
  group_name: string;
  name: string;
  delta_price_cents: number;
}
export interface CartLine {
  line_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  selected_modifiers: CartSelectedModifier[];
  unit_price_cents: number;
  line_total_cents: number;
  notes: string | null;
}
export interface Cart {
  items: CartLine[];
  subtotal_cents: number;
  delivery_fee_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  currency_code: string;
}

export interface OrderItemModifier {
  group_name: string;
  modifier_name: string;
  delta_price_cents: number;
}
export interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  notes: string | null;
  modifiers: OrderItemModifier[];
}
export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  subtotal_cents: number;
  delivery_fee_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  currency_code: string;
  customer: { full_name: string; contact_email: string; contact_phone: string };
  delivery_address: string | null;
  notes: string | null;
  placed_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: OrderItem[];
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
