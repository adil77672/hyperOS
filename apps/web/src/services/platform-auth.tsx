'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, loadSession, saveSession } from '@/services/platform-api';
import type { AuthSession, AuthUser } from '@/services/platform-types';

/** Only accept a same-section `next` target — never redirect off /super-admin. */
function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith('/super-admin') && !raw.startsWith('//')) return raw;
  return '/super-admin';
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const s = loadSession();
    if (s?.user.role !== 'SUPER_ADMIN') {
      saveSession(null);
      setSession(null);
    } else {
      setSession(s);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session && pathname !== '/super-admin/login') router.replace('/super-admin/login');
    if (session && pathname === '/super-admin/login') {
      router.replace(safeNextPath(searchParams.get('next')));
    }
  }, [loading, session, pathname, router, searchParams]);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      loading,
      login: async (email, password) => {
        const s = await api.login(email, password);
        if (s.user.role !== 'SUPER_ADMIN') {
          throw new Error('This console is for SUPER_ADMIN accounts only.');
        }
        saveSession(s);
        setSession(s);
        router.replace(safeNextPath(searchParams.get('next')));
      },
      logout: async () => {
        await api.logout();
        setSession(null);
        router.replace('/super-admin/login');
      },
    }),
    [session, loading, router, searchParams],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
