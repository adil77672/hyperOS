import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { formatMoney } from '../lib/api';
import { useStore } from '../lib/store';
import { palette } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

export function CartScreen({ navigation }: Props) {
  const { boot, cart, updateQuantity, removeItem, currency } = useStore();
  const p = palette(boot);

  if (!cart || cart.items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 16, color: '#667085' }}>Your cart is empty.</Text>
        <Pressable style={[styles.primary, { backgroundColor: p.primary, marginTop: 16 }]} onPress={() => navigation.navigate('Menu')}>
          <Text style={styles.primaryText}>Browse menu</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {cart.items.map((line, index) => (
          <View key={line.line_id} style={[styles.card, { borderColor: p.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: p.foreground }]}>{line.product_name}</Text>
              {line.selected_modifiers.length > 0 ? (
                <Text style={styles.mods}>{line.selected_modifiers.map((m) => m.name).join(', ')}</Text>
              ) : null}
              {line.notes ? <Text style={styles.notes}>“{line.notes}”</Text> : null}
              <View style={styles.controls}>
                <View style={[styles.stepper, { borderColor: p.border }]}>
                  <Pressable onPress={() => updateQuantity(index, line.quantity - 1)} hitSlop={8}>
                    <Text style={styles.stepBtn}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{line.quantity}</Text>
                  <Pressable onPress={() => updateQuantity(index, line.quantity + 1)} hitSlop={8}>
                    <Text style={styles.stepBtn}>＋</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => removeItem(index)} hitSlop={8}>
                  <Text style={{ color: p.danger, fontSize: 13, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              </View>
            </View>
            <Text style={[styles.lineTotal, { color: p.foreground }]}>
              {formatMoney(line.line_total_cents, currency)}
            </Text>
          </View>
        ))}

        <View style={[styles.summary, { borderColor: p.border }]}>
          <Row label="Subtotal" value={formatMoney(cart.subtotal_cents, currency)} />
          {cart.delivery_fee_cents > 0 ? <Row label="Delivery" value={formatMoney(cart.delivery_fee_cents, currency)} /> : null}
          {cart.tax_cents > 0 ? <Row label="Tax" value={formatMoney(cart.tax_cents, currency)} /> : null}
          <View style={{ height: 1, backgroundColor: p.border, marginVertical: 8 }} />
          <Row label="Total" value={formatMoney(cart.total_cents, currency)} bold />
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderColor: p.border }]}>
        <Pressable
          style={[styles.primary, { backgroundColor: p.primary }, !boot?.merchant?.accepting_orders && { opacity: 0.5 }]}
          disabled={!boot?.merchant?.accepting_orders}
          onPress={() => navigation.navigate('Checkout')}
        >
          <Text style={styles.primaryText}>
            {boot?.merchant?.accepting_orders
              ? `Checkout · ${formatMoney(cart.total_cents, currency)}`
              : 'Store closed'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[{ color: '#667085' }, bold && { color: '#101828', fontWeight: '800', fontSize: 16 }]}>{label}</Text>
      <Text style={[bold && { fontWeight: '800', fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  name: { fontWeight: '600' },
  mods: { color: '#667085', marginTop: 2, fontSize: 13 },
  notes: { color: '#98A2B3', fontStyle: 'italic', marginTop: 2, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 4 },
  stepBtn: { fontSize: 18, paddingHorizontal: 10, paddingVertical: 4 },
  qty: { width: 26, textAlign: 'center', fontWeight: '700' },
  lineTotal: { fontWeight: '700' },
  summary: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  footer: { borderTopWidth: 1, padding: 16 },
  primary: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', paddingHorizontal: 24 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
