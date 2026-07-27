'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, loadSession, saveSession } from '@/lib/api';
import type { AuthSession, AuthUser, Merchant } from '@/lib/types';

interface AuthState {
  user: AuthUser | null;
  merchant: Merchant | null;
  merchants: Merchant[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setMerchant: (m: Merchant) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const bootstrap = useCallback(async (existing?: AuthSession | null) => {
    const s = existing ?? loadSession();
    if (!s) {
      setSession(null);
      setMerchants([]);
      setMerchant(null);
      setLoading(false);
      return;
    }
    saveSession(s);
    setSession(s);
    try {
      const me = await api.me();
      setMerchants(me.merchants);
      setMerchant((prev) => {
        if (prev && me.merchants.some((m) => m.id === prev.id)) return prev;
        return me.merchants[0] ?? null;
      });
    } catch {
      saveSession(null);
      setSession(null);
      setMerchants([]);
      setMerchant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (loading) return;
    if (!session && pathname !== '/login') router.replace('/login');
    if (session && pathname === '/login') router.replace('/');
  }, [loading, session, pathname, router]);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      merchant,
      merchants,
      loading,
      login: async (email, password) => {
        const s = await api.login(email, password);
        await bootstrap(s);
        router.replace('/');
      },
      logout: async () => {
        await api.logout();
        setSession(null);
        setMerchants([]);
        setMerchant(null);
        router.replace('/login');
      },
      refreshMe: () => bootstrap(session),
      setMerchant,
    }),
    [session, merchant, merchants, loading, bootstrap, router],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
