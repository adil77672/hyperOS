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

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  default_currency_code: string;
  default_locale: string;
  timezone: string;
  contact_email: string | null;
  created_at: string;
  merchant_count: number;
  order_count: number;
}
