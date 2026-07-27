'use client';

import { Menu } from '@/components/Menu';

/** /products — the full catalogue for the store the domain resolved to. */
export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Menu</h1>
      <Menu />
    </div>
  );
}
