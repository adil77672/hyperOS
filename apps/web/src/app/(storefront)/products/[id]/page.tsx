'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useStore } from '@/lib/store-context';
import { useCart } from '@/lib/cart';
import { formatMoney } from '@/lib/money';
import { ModifierPicker } from '@/components/ModifierPicker';
import { Button, Spinner } from '@/components/ui';

/** /products/[id] — product detail with add-to-cart (server-priced). */
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { boot } = useStore();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  const currency = boot?.tenant.default_currency_code ?? 'AUD';

  useEffect(() => {
    api
      .product(id)
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="Loading…" />;
  if (!product)
    return (
      <div className="py-16 text-center">
        <p className="text-brand-fg/60">Product not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/products')}>
          Back to menu
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {product.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image_url} alt="" className="h-64 w-full rounded-theme object-cover" />
      )}
      <div>
        <h1 className="font-heading text-3xl font-bold">{product.name}</h1>
        {product.description && <p className="mt-2 text-brand-fg/70">{product.description}</p>}
        <p className="mt-3 text-xl font-semibold text-brand-primary">
          {formatMoney(product.price_amount_cents, product.currency_code || currency)}
        </p>
      </div>

      <Button
        disabled={product.status === 'OUT_OF_STOCK'}
        onClick={() => setPicking(true)}
        className="w-full"
      >
        {product.status === 'OUT_OF_STOCK' ? 'Sold out' : 'Add to cart'}
      </Button>

      {picking && (
        <ModifierPicker
          product={product}
          currency={currency}
          onClose={() => setPicking(false)}
          onAdd={async (modifierIds, quantity, notes) => {
            await addItem(product, quantity, modifierIds, notes);
            setPicking(false);
            router.push('/cart');
          }}
        />
      )}
    </div>
  );
}
