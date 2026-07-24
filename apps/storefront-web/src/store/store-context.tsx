'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setCsrfToken } from '@/lib/api';
import type { Bootstrap } from '@/lib/types';
import { CartProvider } from './cart';

/**
 * Loads the storefront's identity once (tenant, merchant, theme, session) and
 * shares it. Also injects the tenant theme as CSS custom properties on :root —
 * the mechanism that makes every Tailwind `brand-*` utility honour the
 * merchant's palette without a rebuild.
 */
interface StoreContextValue {
  boot: Bootstrap | null;
  loading: boolean;
  error: string | null;
}

const StoreContext = createContext<StoreContextValue>({ boot: null, loading: true, error: null });

function applyTheme(boot: Bootstrap): void {
  const root = document.documentElement;
  const { colors, typography, layout } = boot.theme;
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-background', colors.background);
  root.style.setProperty('--color-foreground', colors.foreground);
  root.style.setProperty('--color-muted', colors.muted);
  root.style.setProperty('--color-border', colors.border);
  root.style.setProperty('--color-danger', colors.danger);
  root.style.setProperty('--color-success', colors.success);
  root.style.setProperty('--font-heading', typography.heading_font_family);
  root.style.setProperty('--font-body', typography.body_font_family);
  root.style.setProperty('--radius', `${layout.border_radius_px}px`);
  root.style.setProperty('--container-max', `${layout.container_max_width_px}px`);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .bootstrap()
      .then((b) => {
        if (!alive) return;
        setBoot(b);
        setCsrfToken(b.session.csrf_token);
        applyTheme(b);
        if (b.theme.favicon_url) {
          const link = (document.querySelector("link[rel='icon']") ||
            document.createElement('link')) as HTMLLinkElement;
          link.rel = 'icon';
          link.href = b.theme.favicon_url;
          document.head.appendChild(link);
        }
        document.title = b.tenant.name;
      })
      .catch((e) => alive && setError(e.message ?? 'Failed to load storefront'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <StoreContext.Provider value={{ boot, loading, error }}>
      <CartProvider>{children}</CartProvider>
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  return useContext(StoreContext);
}
