'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ThemeDocument } from '@/lib/types';
import { useAuth } from '@/store/auth';

export default function SettingsPage() {
  const { merchant, refreshMe } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [prep, setPrep] = useState(25);
  const [accepting, setAccepting] = useState(true);
  const [theme, setTheme] = useState<ThemeDocument | null>(null);
  const [primary, setPrimary] = useState('#0f5132');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!merchant) return;
    setName(merchant.name);
    setDescription(merchant.description ?? '');
    setPhone(merchant.contact_phone ?? '');
    setPrep(merchant.avg_prep_minutes);
    setAccepting(merchant.accepting_orders);
    void api
      .getTheme()
      .then((t) => {
        setTheme(t);
        setPrimary(t.colors.primary);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Theme load failed'));
  }, [merchant]);

  async function saveMerchant(e: FormEvent) {
    e.preventDefault();
    if (!merchant) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await api.patchMerchant(merchant.id, {
        name,
        description: description || null,
        contact_phone: phone || null,
        avg_prep_minutes: prep,
        accepting_orders: accepting,
      });
      await refreshMe();
      setMessage('Store settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveTheme(e: FormEvent) {
    e.preventDefault();
    if (!theme) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const next = {
        ...theme,
        colors: { ...theme.colors, primary },
      };
      const saved = await api.putTheme(next);
      setTheme(saved);
      setMessage('Theme saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Theme save failed');
    } finally {
      setBusy(false);
    }
  }

  if (!merchant) return <p className="text-ink-700/70">No merchant.</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="text-sm text-ink-700/70">Store details and brand colour.</p>
      </div>

      {message && <p className="rounded-lg bg-leaf-600/10 px-3 py-2 text-sm text-leaf-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={saveMerchant} className="max-w-xl space-y-4 rounded-2xl border border-ink-200 bg-white/70 p-5">
        <h2 className="font-semibold">Store</h2>
        <label className="block text-sm font-semibold">
          Name
          <input className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block text-sm font-semibold">
          Description
          <textarea className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block text-sm font-semibold">
          Phone
          <input className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block text-sm font-semibold">
          Avg prep minutes
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={prep}
            onChange={(e) => setPrep(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} />
          Accepting orders
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-leaf-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Save store
        </button>
      </form>

      <form onSubmit={saveTheme} className="max-w-xl space-y-4 rounded-2xl border border-ink-200 bg-white/70 p-5">
        <h2 className="font-semibold">Brand colour</h2>
        <label className="block text-sm font-semibold">
          Primary
          <div className="mt-1 flex items-center gap-3">
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
            <input className="flex-1 rounded-lg border border-ink-200 px-3 py-2 font-mono text-sm" value={primary} onChange={(e) => setPrimary(e.target.value)} />
          </div>
        </label>
        <button type="submit" disabled={busy || !theme} className="rounded-lg bg-leaf-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Save theme
        </button>
      </form>
    </div>
  );
}
