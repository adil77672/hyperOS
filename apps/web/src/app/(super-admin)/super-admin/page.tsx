'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/platform-api';
import type { PlatformTenant, TenantStatus } from '@/services/platform-types';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setTenants(await api.listTenants());
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  async function setStatus(id: string, status: TenantStatus) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api.setTenantStatus(id, status);
      setTenants((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Tenants</h2>
        <p className="text-sm text-slate-500">Suspend or reactivate merchant businesses on the platform.</p>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Merchants</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-semibold">{t.name}</p>
                  <p className="font-mono text-xs text-slate-500">{t.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : t.status === 'SUSPENDED'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3">{t.merchant_count}</td>
                <td className="px-4 py-3">{t.order_count}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {t.status !== 'ACTIVE' && (
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void setStatus(t.id, 'ACTIVE')}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                      >
                        Activate
                      </button>
                    )}
                    {t.status === 'ACTIVE' && (
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void setStatus(t.id, 'SUSPENDED')}
                        className="rounded-md border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                    {t.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void setStatus(t.id, 'CANCELLED')}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  No tenants yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
