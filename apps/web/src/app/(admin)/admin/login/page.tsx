'use client';

import { FormEvent, useState } from 'react';
import { ApiError } from '@/services/admin-api';
import { useAuth } from '@/services/admin-auth';

export default function LoginPage() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('owner@cheesyone.com');
  const [password, setPassword] = useState('cheesyone-dev-12345');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-ink-200 bg-white/80 p-8 shadow-sm backdrop-blur"
      >
        <p className="font-display text-3xl font-bold text-leaf-700">Hyperzod</p>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">Merchant sign in</h1>
        <p className="mt-1 text-sm text-ink-700/70">Orders, catalog, and store settings.</p>

        <label className="mt-6 block text-sm font-semibold">
          Email
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2.5 outline-none focus:border-leaf-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2.5 outline-none focus:border-leaf-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-leaf-600 px-4 py-3 text-sm font-semibold text-white hover:bg-leaf-700 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
