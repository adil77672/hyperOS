import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { api, formatMoney } from '../lib/api';
import { useStore } from '../lib/store';
import { palette } from '../lib/theme';
import type { Menu, Product } from '../lib/types';
import { ModifierSheet } from '../components/ModifierSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

export function MenuScreen({ navigation }: Props) {
  const { boot, loading, error, count, addItem, currency } = useStore();
  const p = palette(boot);
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [picking, setPicking] = useState<Product | null>(null);

  useEffect(() => {
    api.menu().then(setMenu).catch(() => undefined);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={p.primary} />
        <Text style={{ marginTop: 12, color: '#667085' }}>Loading storefront…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: p.danger, fontWeight: '700' }}>Couldn’t reach the store</Text>
        <Text style={{ marginTop: 6, color: '#667085', textAlign: 'center', paddingHorizontal: 24 }}>
          {error}
        </Text>
        <Text style={{ marginTop: 12, color: '#98A2B3', fontSize: 12, textAlign: 'center' }}>
          Set EXPO_PUBLIC_API_BASE to a host your device can reach (see .env).
        </Text>
      </View>
    );
  }

  const categories = (menu?.categories ?? []).filter((c) => c.products.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {boot?.merchant ? (
          <View style={[styles.hero, { backgroundColor: p.primary }]}>
            <Text style={styles.heroTitle}>{boot.theme.hero?.heading_text || boot.tenant.name}</Text>
            {boot.theme.hero?.subheading_text ? (
              <Text style={styles.heroSub}>{boot.theme.hero.subheading_text}</Text>
            ) : null}
            <Text style={styles.heroMeta}>
              {boot.merchant.name} · ~{boot.merchant.avg_prep_minutes} min
              {boot.merchant.accepting_orders ? '' : ' · closed'}
            </Text>
          </View>
        ) : null}

        {categories.map((c) => (
          <View key={c.id} style={{ marginBottom: 24 }}>
            <Text style={[styles.catTitle, { color: p.foreground }]}>{c.name}</Text>
            {c.products.map((prod) => (
              <Pressable
                key={prod.id}
                onPress={() => setPicking(prod)}
                disabled={prod.status === 'OUT_OF_STOCK'}
                style={[styles.card, { borderColor: p.border }, prod.status === 'OUT_OF_STOCK' && { opacity: 0.5 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.prodName, { color: p.foreground }]}>{prod.name}</Text>
                  {prod.description ? (
                    <Text numberOfLines={2} style={styles.prodDesc}>
                      {prod.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.prodPrice, { color: p.primary }]}>
                    {formatMoney(prod.price_amount_cents, prod.currency_code || currency)}
                  </Text>
                  {prod.status === 'OUT_OF_STOCK' ? (
                    <Text style={{ color: p.danger, fontSize: 12, marginTop: 2 }}>Sold out</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      {count > 0 ? (
        <View style={[styles.cartBarWrap, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={[styles.cartBar, { backgroundColor: p.primary }]} onPress={() => navigation.navigate('Cart')}>
            <Text style={styles.cartBarText}>View cart</Text>
            <Text style={styles.cartBarBadge}>{count}</Text>
          </Pressable>
        </View>
      ) : null}

      {picking ? (
        <ModifierSheet
          product={picking}
          boot={boot}
          currency={currency}
          onClose={() => setPicking(null)}
          onAdd={async (ids, qty, notes) => {
            await addItem(picking, qty, ids, notes);
            setPicking(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 16, padding: 20, marginBottom: 20 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  heroMeta: { color: 'rgba(255,255,255,0.8)', marginTop: 10, fontSize: 12 },
  catTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  card: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  prodName: { fontWeight: '600', fontSize: 15 },
  prodDesc: { color: '#667085', marginTop: 3, fontSize: 13 },
  prodPrice: { fontWeight: '700', marginTop: 8 },
  cartBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  cartBarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cartBarBadge: {
    color: '#fff',
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
});
