'use client';

import { FormEvent, useState } from 'react';
import { ApiError } from '@/services/platform-api';
import { useAuth } from '@/services/platform-auth';

export default function LoginPage() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('admin@hyperzod.local');
  const [password, setPassword] = useState('hyperzod-admin-12345');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sea-600">Control plane</p>
        <h1 className="mt-2 text-2xl font-bold">Super-admin sign in</h1>
        <label className="mt-6 block text-sm font-semibold">
          Email
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          Password
          <input type="password" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-sea-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sea-500 disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
