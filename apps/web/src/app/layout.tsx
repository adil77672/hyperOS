import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Order online',
  description: 'Order for pickup or delivery.',
};

/**
 * Root layout only sets the html/body shell. Each route group — (storefront),
 * (user), (admin), (super-admin) — brings its own providers and chrome so the
 * surfaces stay isolated while sharing this shell.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
