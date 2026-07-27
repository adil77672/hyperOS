import { AuthProvider } from '@/services/admin-auth';
import { Shell } from '@/components/AdminShell';

/**
 * (admin) — store/merchant dashboard, mounted at /admin/*. Nested layout (no
 * html/body — the root layout owns those). AuthProvider gates access; the login
 * page renders inside AuthProvider but outside the authed Shell chrome.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
