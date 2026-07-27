'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/store/auth';

const NAV = [
  { href: '/', label: 'Orders' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/settings', label: 'Settings' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, merchant, loading, logout } = useAuth();
  const pathname = usePathname();

  if (pathname === '/login') return <>{children}</>;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-700/70">
        Loading dashboard…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-4">
        <div>
          <p className="font-display text-3xl font-bold tracking-tight text-leaf-700">Hyperzod</p>
          <p className="mt-1 text-sm text-ink-700/70">
            {merchant?.name ?? 'Merchant'} · {user.full_name}
          </p>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active ? 'bg-leaf-600 text-white' : 'text-ink-700 hover:bg-ink-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => void logout()}
            className="ml-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-700/70 hover:bg-ink-100"
          >
            Sign out
          </button>
        </nav>
      </header>
      {children}
    </div>
  );
}
