'use client';

import { useStore } from '@/store/store-context';
import { Menu } from '@/components/Menu';
import { Spinner } from '@/components/ui';

export default function HomePage() {
  const { boot, loading, error } = useStore();

  if (loading) return <Spinner label="Loading storefront…" />;
  if (error)
    return (
      <div className="rounded-theme border border-brand-danger/30 bg-brand-danger/5 p-6 text-center">
        <p className="font-semibold text-brand-danger">Couldn’t reach the store</p>
        <p className="mt-1 text-sm text-brand-fg/60">{error}</p>
        <p className="mt-3 text-xs text-brand-fg/50">
          Is the backend running on {process.env.NEXT_PUBLIC_API_BASE}? Try <code>npm run dev</code> in
          apps/backend-server.
        </p>
      </div>
    );

  const hero = boot?.theme.hero;

  return (
    <div className="space-y-8">
      <section
        className="relative overflow-hidden rounded-theme border border-brand-border"
        style={{
          backgroundImage: boot?.theme.hero_image_url
            ? `url(${boot.theme.hero_image_url})`
            : 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          className="flex min-h-[220px] flex-col justify-end p-6 sm:min-h-[300px] sm:p-10"
          style={{ background: `rgba(0,0,0,${boot?.theme.hero?.overlay_opacity ?? 0.35})` }}
        >
          <h1 className="font-heading text-3xl font-bold text-white sm:text-4xl">
            {hero?.heading_text || boot?.tenant.name}
          </h1>
          {hero?.subheading_text && (
            <p className="mt-2 max-w-lg text-white/90">{hero.subheading_text}</p>
          )}
          {boot?.merchant && (
            <p className="mt-3 text-sm text-white/80">
              {boot.merchant.name} · ~{boot.merchant.avg_prep_minutes} min prep
            </p>
          )}
        </div>
      </section>

      <Menu />
    </div>
  );
}
