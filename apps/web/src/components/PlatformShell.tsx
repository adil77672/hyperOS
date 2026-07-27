'use client';

import { useAuth } from '@/services/platform-auth';
import { usePathname } from 'next/navigation';

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  if (pathname === '/super-admin/login') return <>{children}</>;
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sea-600">Control plane</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Hyperzod Admin</h1>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-white"
        >
          Sign out
        </button>
      </header>
      {children}
    </div>
  );
}
