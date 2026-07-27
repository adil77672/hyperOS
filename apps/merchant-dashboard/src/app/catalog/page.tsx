'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import type { Category, Menu } from '@/lib/types';
import { useAuth } from '@/store/auth';

export default function CatalogPage() {
  const { merchant } = useAuth();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [productForm, setProductForm] = useState({
    category_id: '',
    name: '',
    price: '',
    description: '',
  });
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!merchant) return;
    setMenu(await api.menu(merchant.id));
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, [merchant]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!merchant || !categoryName.trim()) return;
    setBusy(true);
    try {
      await api.createCategory(merchant.id, categoryName.trim());
      setCategoryName('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create category failed');
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    if (!merchant || !productForm.category_id || !productForm.name || !productForm.price) return;
    setBusy(true);
    try {
      const dollars = Number(productForm.price);
      await api.createProduct(merchant.id, {
        category_id: productForm.category_id,
        name: productForm.name.trim(),
        description: productForm.description.trim() || undefined,
        price_amount_cents: Math.round(dollars * 100),
      });
      setProductForm({ category_id: productForm.category_id, name: '', price: '', description: '' });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create product failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleProduct(category: Category, productId: string, status: string) {
    const next = status === 'ACTIVE' ? 'OUT_OF_STOCK' : 'ACTIVE';
    setBusy(true);
    try {
      await api.patchProduct(productId, { status: next });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  if (!merchant) return <p className="text-ink-700/70">No merchant.</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Catalog</h1>
        <p className="text-sm text-ink-700/70">Categories and products for your storefront menu.</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={addCategory} className="rounded-2xl border border-ink-200 bg-white/70 p-4">
          <h2 className="font-semibold">Add category</h2>
          <input
            className="mt-3 w-full rounded-lg border border-ink-200 px-3 py-2"
            placeholder="e.g. Coffee"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-3 rounded-lg bg-leaf-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Create category
          </button>
        </form>

        <form onSubmit={addProduct} className="rounded-2xl border border-ink-200 bg-white/70 p-4">
          <h2 className="font-semibold">Add product</h2>
          <select
            className="mt-3 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={productForm.category_id}
            onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}
            required
          >
            <option value="">Select category</option>
            {(menu?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="mt-2 w-full rounded-lg border border-ink-200 px-3 py-2"
            placeholder="Name"
            value={productForm.name}
            onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="mt-2 w-full rounded-lg border border-ink-200 px-3 py-2"
            placeholder="Price (e.g. 4.50)"
            value={productForm.price}
            onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
            required
          />
          <input
            className="mt-2 w-full rounded-lg border border-ink-200 px-3 py-2"
            placeholder="Description (optional)"
            value={productForm.description}
            onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-3 rounded-lg bg-leaf-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Create product
          </button>
        </form>
      </div>

      <div className="space-y-6">
        {(menu?.categories ?? []).map((category) => (
          <section key={category.id} className="rounded-2xl border border-ink-200 bg-white/70 p-4">
            <h2 className="font-display text-xl font-semibold">{category.name}</h2>
            <ul className="mt-3 divide-y divide-ink-100">
              {category.products.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-sm text-ink-700/60">
                      {formatMoney(p.price_amount_cents, p.currency_code)} · {p.status}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleProduct(category, p.id, p.status)}
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold hover:bg-ink-50"
                  >
                    {p.status === 'ACTIVE' ? 'Mark out of stock' : 'Mark active'}
                  </button>
                </li>
              ))}
              {category.products.length === 0 && (
                <li className="py-6 text-sm text-ink-700/40">No products yet</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
