import { Suspense } from 'react';
import { AuthProvider } from '@/services/platform-auth';
import { Shell } from '@/components/PlatformShell';

/**
 * (super-admin) — platform control plane, mounted at /super-admin/*. Nested
 * layout; the root layout owns html/body.
 *
 * Suspense is required: AuthProvider reads useSearchParams() for the
 * post-login `?next=` redirect target, and Next hard-fails static generation
 * without a boundary around it.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthProvider>
        <Shell>{children}</Shell>
      </AuthProvider>
    </Suspense>
  );
}
