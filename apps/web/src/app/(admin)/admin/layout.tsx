import { Suspense } from 'react';
import { AuthProvider } from '@/services/admin-auth';
import { Shell } from '@/components/AdminShell';

/**
 * (admin) — store/merchant dashboard, mounted at /admin/*. Nested layout (no
 * html/body — the root layout owns those). AuthProvider gates access; the login
 * page renders inside AuthProvider but outside the authed Shell chrome.
 *
 * The Suspense boundary is required, not decorative: AuthProvider reads
 * useSearchParams() (for the post-login `?next=` redirect target), and Next
 * hard-fails static generation for any page under a searchParams-reading
 * client component that isn't wrapped in Suspense.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthProvider>
        <Shell>{children}</Shell>
      </AuthProvider>
    </Suspense>
  );
}
