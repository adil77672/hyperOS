import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Product } from '../lib/types';
import { formatMoney } from '../lib/api';
import { palette, type Palette } from '../lib/theme';
import type { Bootstrap } from '../lib/types';

/**
 * Product customization bottom sheet. Mirrors the server's modifier rules so
 * "Add" only enables for a valid selection; the server re-validates on checkout.
 */
export function ModifierSheet({
  product,
  boot,
  currency,
  onClose,
  onAdd,
}: {
  product: Product;
  boot: Bootstrap | null;
  currency: string;
  onClose: () => void;
  onAdd: (modifierIds: string[], quantity: number, notes: string) => Promise<void>;
}) {
  const p = palette(boot);
  const groups = [...product.modifier_groups].sort((a, b) => a.sort_order - b.sort_order);

  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
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
      } else if (set.has(modifierId)) set.delete(modifierId);
      else set.add(modifierId);
      return { ...prev, [groupId]: set };
    });
  }

  const allIds = useMemo(() => Object.values(selected).flatMap((s) => [...s]), [selected]);
  const unitPrice = useMemo(() => {
    const delta = groups
      .flatMap((g) => g.modifiers.filter((m) => selected[g.id]?.has(m.id)))
      .reduce((sum, m) => sum + m.delta_price_cents, 0);
    return Math.max(0, product.price_amount_cents + delta);
  }, [selected, groups, product.price_amount_cents]);

  const invalid = groups.find((g) => {
    const n = selected[g.id]?.size ?? 0;
    if (g.selection_type === 'SINGLE') return g.is_required && n === 0;
    if (g.is_required && n === 0) return true;
    if (n > 0 && n < g.min_selections) return true;
    return n > g.max_selections;
  });

  async function submit() {
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onAdd(allIds, quantity, notes);
    } finally {
      setBusy(false);
    }
  }

  const s = styles(p);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{product.name}</Text>
              {product.description ? <Text style={s.sub}>{product.description}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={s.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 16 }}>
            {groups.map((g) => (
              <View key={g.id} style={{ marginBottom: 18 }}>
                <View style={s.groupHead}>
                  <Text style={s.groupName}>{g.name}</Text>
                  <Text style={s.groupMeta}>
                    {g.is_required ? 'Required' : 'Optional'}
                    {g.selection_type === 'MULTIPLE' && g.max_selections ? ` · up to ${g.max_selections}` : ''}
                  </Text>
                </View>
                {g.modifiers.map((m) => {
                  const checked = selected[g.id]?.has(m.id) ?? false;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => toggle(g.id, m.id, g.selection_type === 'SINGLE')}
                      style={[s.option, checked && s.optionOn]}
                    >
                      <View style={s.row}>
                        <View style={[s.dot, checked && s.dotOn]} />
                        <Text style={s.optionText}>{m.name}</Text>
                      </View>
                      {m.delta_price_cents !== 0 ? (
                        <Text style={s.delta}>
                          {m.delta_price_cents > 0 ? '+' : '−'}
                          {formatMoney(Math.abs(m.delta_price_cents), currency)}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Text style={s.groupName}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Extra hot"
              style={s.input}
              placeholderTextColor="#9AA4B2"
            />
          </ScrollView>

          <View style={s.footer}>
            <View style={s.stepper}>
              <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} hitSlop={8}>
                <Text style={s.stepBtn}>−</Text>
              </Pressable>
              <Text style={s.qty}>{quantity}</Text>
              <Pressable onPress={() => setQuantity((q) => Math.min(99, q + 1))} hitSlop={8}>
                <Text style={s.stepBtn}>＋</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={submit}
              disabled={!!invalid || busy}
              style={[s.addBtn, (!!invalid || busy) && { opacity: 0.5 }]}
            >
              <Text style={s.addText}>
                {invalid ? `Choose ${invalid.name}` : `Add · ${formatMoney(unitPrice * quantity, currency)}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: p.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: p.foreground },
    sub: { marginTop: 4, color: '#667085' },
    close: { fontSize: 18, color: '#667085', paddingLeft: 12 },
    groupHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    groupName: { fontWeight: '600', color: p.foreground },
    groupMeta: { fontSize: 12, color: '#98A2B3' },
    option: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    optionOn: { borderColor: p.primary, backgroundColor: `${p.primary}0D` },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: p.border },
    dotOn: { borderColor: p.primary, backgroundColor: p.primary },
    optionText: { color: p.foreground },
    delta: { color: '#667085' },
    input: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 8,
      color: p.foreground,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 10,
      paddingHorizontal: 6,
    },
    stepBtn: { fontSize: 20, paddingHorizontal: 10, paddingVertical: 6, color: p.foreground },
    qty: { width: 28, textAlign: 'center', fontWeight: '700', color: p.foreground },
    addBtn: { flex: 1, backgroundColor: p.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    addText: { color: '#fff', fontWeight: '700' },
  });
