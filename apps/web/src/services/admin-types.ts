export type OrderStatus =
  | 'PENDING'
  | 'MERCHANT_ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED';

export type ProductStatus = 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED';

export interface AuthUser {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  expires_in: number;
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

export interface DashboardMe {
  user: { id: string; tenant_id: string; role: string };
  merchants: Merchant[];
}

export interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  notes: string | null;
  modifiers: { group_name: string; modifier_name: string; delta_price_cents: number }[];
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  fulfillment_type: 'PICKUP' | 'DELIVERY';
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
  items: OrderItem[];
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

export interface ThemeDocument {
  logo_url: string | null;
  favicon_url: string | null;
  hero_image_url: string | null;
  about_text: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    muted: string;
    border: string;
    danger: string;
    success: string;
  };
  typography: {
    heading_font_family: string;
    body_font_family: string;
    base_font_size_px: number;
    heading_weight: number;
    body_weight: number;
  };
  layout: { border_radius_px: number; container_max_width_px: number };
  hero: {
    style: string;
    overlay_opacity: number;
    heading_text?: string | null;
    subheading_text?: string | null;
  };
  social_links: Record<string, string | null>;
}

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'MERCHANT_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
];

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'MERCHANT_ACCEPTED',
  MERCHANT_ACCEPTED: 'PREPARING',
  PREPARING: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'DELIVERED',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'New',
  MERCHANT_ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready',
  OUT_FOR_DELIVERY: 'Out',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  DELIVERY_FAILED: 'Failed',
};
