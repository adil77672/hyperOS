import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { api, formatMoney } from '../lib/api';
import { useStore } from '../lib/store';
import { palette } from '../lib/theme';
import type { Order, OrderStatus } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Order'>;

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PENDING', label: 'Placed' },
  { status: 'MERCHANT_ACCEPTED', label: 'Accepted' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY_FOR_PICKUP', label: 'Ready' },
  { status: 'DELIVERED', label: 'Done' },
];
const TERMINAL: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'];

export function OrderScreen({ route }: Props) {
  const { boot } = useStore();
  const p = palette(boot);
  const [order, setOrder] = useState<Order | null>(route.params.order ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const { order: o } = await api.order(route.params.orderId);
        if (!alive) return;
        setOrder(o);
        if (!TERMINAL.includes(o.status)) timer = setTimeout(poll, 5000);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Order not found');
      }
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [route.params.orderId]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: p.danger, fontWeight: '700' }}>Order not found</Text>
        <Text style={{ color: '#667085', marginTop: 6 }}>{error}</Text>
      </View>
    );
  }
  if (!order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  const cancelled = order.status === 'CANCELLED' || order.status === 'DELIVERY_FAILED';
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={{ padding: 16 }}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ color: '#667085' }}>Order</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: p.foreground }}>{order.order_number}</Text>
        <Text style={{ color: '#667085', marginTop: 4 }}>
          {order.fulfillment_type === 'PICKUP' ? 'Pickup' : 'Delivery'} ·{' '}
          {new Date(order.placed_at).toLocaleString()}
        </Text>
      </View>

      {cancelled ? (
        <View style={[styles.cancelBox, { borderColor: p.danger, backgroundColor: `${p.danger}0D` }]}>
          <Text style={{ color: p.danger, fontWeight: '700' }}>
            {order.status === 'CANCELLED' ? 'Order cancelled' : 'Delivery failed'}
          </Text>
          {order.cancellation_reason ? (
            <Text style={{ color: '#667085', marginTop: 4 }}>{order.cancellation_reason}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.steps}>
          {STEPS.map((step, i) => {
            const done = i <= currentIndex;
            return (
              <View key={step.status} style={styles.step}>
                <View style={[styles.circle, { borderColor: done ? p.primary : p.border, backgroundColor: done ? p.primary : 'transparent' }]}>
                  <Text style={{ color: done ? '#fff' : '#98A2B3', fontWeight: '700', fontSize: 12 }}>
                    {done ? '✓' : i + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, { color: done ? p.foreground : '#98A2B3', fontWeight: done ? '700' : '400' }]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={[styles.itemsCard, { borderColor: p.border }]}>
        {order.items.map((it) => (
          <View key={it.id} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: p.foreground }}>
                {it.quantity}× {it.product_name}
              </Text>
              {it.modifiers.length > 0 ? (
                <Text style={{ color: '#667085', fontSize: 13, marginTop: 2 }}>
                  {it.modifiers.map((m) => m.modifier_name).join(', ')}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontWeight: '600' }}>{formatMoney(it.line_total_cents, order.currency_code)}</Text>
          </View>
        ))}
        <View style={[styles.totalRow, { borderColor: p.border }]}>
          <Text style={{ fontWeight: '800', fontSize: 16 }}>Total</Text>
          <Text style={{ fontWeight: '800', fontSize: 16 }}>
            {formatMoney(order.total_cents, order.currency_code)}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  step: { alignItems: 'center', flex: 1 },
  circle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 11, marginTop: 6 },
  cancelBox: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 24, alignItems: 'center' },
  itemsCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: 1 },
});
