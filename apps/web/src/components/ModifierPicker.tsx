'use client';

import { useMemo, useState } from 'react';
import type { Product } from '@/lib/types';
import { formatDelta, formatMoney } from '@/lib/money';
import { Button } from './ui';

/**
 * Product customization modal. Mirrors the server's validation rules
 * (PRODUCT_MAPPING §3.5) so the "Add" button only enables for a valid
 * selection — but the server re-validates and re-prices on checkout regardless.
 */
export function ModifierPicker({
  product,
  currency,
  onClose,
  onAdd,
}: {
  product: Product;
  currency: string;
  onClose: () => void;
  onAdd: (modifierIds: string[], quantity: number, notes: string) => Promise<void>;
}) {
  const groups = [...product.modifier_groups].sort((a, b) => a.sort_order - b.sort_order);

  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    // Preselect defaults, and the first option of a required SINGLE group.
    const init: Record<string, Set<string>> = {};
    for (const g of groups) {
      const set = new Set<string>();
      for (const m of g.modifiers) if (m.is_default) set.add(m.id);
      if (g.selection_type === 'SINGLE' && g.is_required && set.size === 0 && g.modifiers[0]) {
        set.add(g.modifiers[0].id);
      }
      init[g.id] = set;
    }
    return init;
  });
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(groupId: string, modifierId: string, single: boolean) {
    setSelected((prev) => {
      const set = new Set(prev[groupId]);
      if (single) {
        set.clear();
        set.add(modifierId);
      } else if (set.has(modifierId)) {
        set.delete(modifierId);
      } else {
        set.add(modifierId);
      }
      return { ...prev, [groupId]: set };
    });
  }

  const allIds = useMemo(
    () => Object.values(selected).flatMap((s) => [...s]),
    [selected],
  );

  const unitPrice = useMemo(() => {
    const delta = groups
      .flatMap((g) => g.modifiers.filter((m) => selected[g.id]?.has(m.id)))
      .reduce((sum, m) => sum + m.delta_price_cents, 0);
    return Math.max(0, product.price_amount_cents + delta);
  }, [selected, groups, product.price_amount_cents]);

  const invalidGroup = groups.find((g) => {
    const n = selected[g.id]?.size ?? 0;
    if (g.selection_type === 'SINGLE') return g.is_required && n === 0;
    if (g.is_required && n === 0) return true;
    if (n > 0 && n < g.min_selections) return true;
    if (n > g.max_selections) return true;
    return false;
  });

  async function submit() {
    if (invalidGroup || busy) return;
    setBusy(true);
    try {
      await onAdd(allIds, quantity, notes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-brand-bg sm:rounded-theme">
        <div className="flex items-start justify-between border-b border-brand-border p-5">
          <div>
            <h2 className="font-heading text-xl font-semibold">{product.name}</h2>
            {product.description && (
              <p className="mt-1 text-sm text-brand-fg/60">{product.description}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-brand-fg/50 hover:bg-brand-muted">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {groups.map((g) => (
            <fieldset key={g.id}>
              <legend className="mb-2 flex w-full items-center justify-between">
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-brand-fg/50">
                  {g.is_required ? 'Required' : 'Optional'}
                  {g.selection_type === 'MULTIPLE' && g.max_selections
                    ? ` · up to ${g.max_selections}`
                    : ''}
                </span>
              </legend>
              <div className="space-y-2">
                {g.modifiers.map((m) => {
                  const checked = selected[g.id]?.has(m.id) ?? false;
                  return (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center justify-between rounded-theme border px-3 py-2.5 text-sm transition ${
                        checked ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-border'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type={g.selection_type === 'SINGLE' ? 'radio' : 'checkbox'}
                          name={g.id}
                          checked={checked}
                          onChange={() => toggle(g.id, m.id, g.selection_type === 'SINGLE')}
                          className="accent-brand-primary"
                        />
                        {m.name}
                      </span>
                      {m.delta_price_cents !== 0 && (
                        <span className="text-brand-fg/60">{formatDelta(m.delta_price_cents, currency)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div>
            <span className="mb-1 block text-sm font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Extra hot, no sugar"
              className="w-full rounded-theme border border-brand-border bg-brand-bg px-3 py-2 text-sm outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-brand-border p-5">
          <div className="flex items-center rounded-theme border border-brand-border">
            <button className="px-3 py-2 text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
            <button className="px-3 py-2 text-lg" onClick={() => setQuantity((q) => Math.min(99, q + 1))}>
              +
            </button>
          </div>
          <Button className="flex-1" disabled={!!invalidGroup || busy} onClick={submit}>
            {invalidGroup
              ? `Choose ${invalidGroup.name}`
              : `Add · ${formatMoney(unitPrice * quantity, currency)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
