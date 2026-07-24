import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/store/store-context';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: 'Order online',
  description: 'Fresh, fast, local — order for pickup or delivery.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <StoreProvider>
          <Header />
          <main className="mx-auto w-full max-w-container px-4 pb-24 pt-6 sm:px-6">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
