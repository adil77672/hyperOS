// Wire types mirroring the backend contracts. Kept local so the mobile app is
// self-contained. All money is integer cents; all ids are UUID strings.

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

export interface ThemeDocument {
  logo_url: string | null;
  hero_image_url: string | null;
  about_text: string | null;
  colors: Record<string, string>;
  typography: Record<string, unknown>;
  hero: { heading_text?: string | null; subheading_text?: string | null; overlay_opacity: number };
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
export interface CartLine {
  line_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  selected_modifiers: { id: string; group_name: string; name: string; delta_price_cents: number }[];
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

export interface OrderItem {
  id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  modifiers: { group_name: string; modifier_name: string; delta_price_cents: number }[];
}
export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  total_cents: number;
  currency_code: string;
  placed_at: string;
  cancellation_reason: string | null;
  items: OrderItem[];
}
