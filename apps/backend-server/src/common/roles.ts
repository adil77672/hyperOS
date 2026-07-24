import { UserRole } from '@hyperzod/shared-types';

/** Any role that may operate a merchant's dashboard (API contracts §5.6). */
export const MERCHANT_DASHBOARD_ROLES: UserRole[] = [
  UserRole.TENANT_ADMIN,
  UserRole.MERCHANT_OWNER,
  UserRole.MERCHANT_STAFF,
];
