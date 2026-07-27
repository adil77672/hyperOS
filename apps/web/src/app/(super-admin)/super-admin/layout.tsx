import { AuthProvider } from '@/services/platform-auth';
import { Shell } from '@/components/PlatformShell';

/**
 * (super-admin) — platform control plane, mounted at /super-admin/*. Nested
 * layout; the root layout owns html/body.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
