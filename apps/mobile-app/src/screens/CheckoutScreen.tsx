import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { api, ApiError, formatMoney } from '../lib/api';
import { useStore } from '../lib/store';
import { palette } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;
type Fulfillment = 'PICKUP' | 'DELIVERY';

export function CheckoutScreen({ navigation }: Props) {
  const { boot, cart, items, clearCart, currency } = useStore();
  const p = palette(boot);

  const [fulfillment, setFulfillment] = useState<Fulfillment>('PICKUP');
  const [form, setForm] = useState({ full_name: '', contact_email: '', contact_phone: '', address: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!cart || cart.items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#667085' }}>Your cart is empty.</Text>
      </View>
    );
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = 'Required';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact_email)) e.contact_email = 'Enter a valid email';
    if (!/^\+[1-9]\d{6,14}$/.test(form.contact_phone)) e.contact_phone = 'Use +country format';
    if (fulfillment === 'DELIVERY' && !form.address.trim()) e.address = 'Required for delivery';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { order } = await api.checkout({
        fulfillment_type: fulfillment,
        customer: {
          full_name: form.full_name.trim(),
          contact_email: form.contact_email.trim(),
          contact_phone: form.contact_phone.trim(),
        },
        delivery_address: fulfillment === 'DELIVERY' ? form.address.trim() : null,
        notes: form.notes.trim() || null,
        items,
      });
      clearCart();
      navigation.replace('Order', { orderId: order.id, order });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder?: string, keyboard?: 'email-address' | 'phone-pad') => (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={(v) => setForm({ ...form, [key]: v })}
        placeholder={placeholder}
        placeholderTextColor="#9AA4B2"
        autoCapitalize={key === 'contact_email' ? 'none' : 'sentences'}
        keyboardType={keyboard}
        style={[styles.input, { borderColor: errors[key] ? p.danger : p.border, color: p.foreground }]}
      />
      {errors[key] ? <Text style={{ color: p.danger, fontSize: 12, marginTop: 4 }}>{errors[key]}</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.section}>Fulfillment</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>
          {(['PICKUP', 'DELIVERY'] as Fulfillment[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFulfillment(f)}
              style={[
                styles.choice,
                { borderColor: fulfillment === f ? p.primary : p.border, backgroundColor: fulfillment === f ? `${p.primary}0D` : 'transparent' },
              ]}
            >
              <Text style={{ fontWeight: '600', color: p.foreground }}>
                {f === 'PICKUP' ? '🏪 Pickup' : '🛵 Delivery'}
              </Text>
            </Pressable>
          ))}
        </View>

        {field('full_name', 'Full name')}
        {field('contact_phone', 'Phone', '+61400111222', 'phone-pad')}
        {field('contact_email', 'Email', 'you@example.com', 'email-address')}
        {fulfillment === 'DELIVERY' ? field('address', 'Delivery address') : null}
        {field('notes', 'Order notes (optional)')}

        {serverError ? (
          <View style={[styles.errorBox, { borderColor: p.danger, backgroundColor: `${p.danger}0D` }]}>
            <Text style={{ color: p.danger }}>{serverError}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderColor: p.border }]}>
        <Pressable
          style={[styles.primary, { backgroundColor: p.primary }, submitting && { opacity: 0.6 }]}
          disabled={submitting}
          onPress={submit}
        >
          <Text style={styles.primaryText}>
            {submitting ? 'Placing order…' : `Place order · ${formatMoney(cart.total_cents, currency)}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { fontWeight: '700', marginBottom: 8, fontSize: 15 },
  choice: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  label: { fontWeight: '600', marginBottom: 6, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 4 },
  footer: { borderTopWidth: 1, padding: 16 },
  primary: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
