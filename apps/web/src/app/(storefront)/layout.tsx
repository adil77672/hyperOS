import { StoreProvider } from '@/lib/store-context';
import { Header } from '@/components/Header';

/**
 * (storefront) — the guest/customer shop for whichever store the domain
 * resolves to. StoreProvider loads that tenant's identity + theme (from the
 * backend, keyed on Host) and injects the theme as CSS variables, so the same
 * code renders each store in its own branding.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <Header />
      <main className="mx-auto w-full max-w-container px-4 pb-24 pt-6 sm:px-6">{children}</main>
    </StoreProvider>
  );
}
