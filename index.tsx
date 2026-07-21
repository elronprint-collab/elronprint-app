import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '../../lib/cart';
import { createCheckout } from '../../lib/shopify';
import { C, R, S } from '../../lib/theme';

export default function Cart() {
  const cart = useCart();
  const [busy, setBusy] = useState(false);

  async function checkout() {
    if (cart.items.length === 0 || busy) return;
    setBusy(true);
    try {
      const url = await createCheckout(
        cart.items.map((i) => ({
          merchandiseId: i.variantId,
          quantity: i.quantity,
          attributes: i.attributes,
        })),
      );
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'המעבר לתשלום נכשל, נסו שוב');
    } finally {
      setBusy(false);
    }
  }

  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <Text style={st.title}>העגלה שלי</Text>
        <View style={st.center}>
          <Text style={st.empty}>העגלה ריקה</Text>
          <Text style={st.hint}>מעצבים חולצה בסטודיו או בוחרים מהחנות — והיא תופיע כאן</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Text style={st.title}>העגלה שלי</Text>
      <ScrollView contentContainerStyle={st.scroll}>
        {cart.items.map((item) => (
          <View key={item.key} style={st.card}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={st.thumb} contentFit="cover" />
            ) : (
              <View style={[st.thumb, st.noThumb]} />
            )}
            <View style={st.info}>
              <Text style={st.itemTitle} numberOfLines={2}>{item.title}</Text>
              {item.subtitle ? <Text style={st.itemSub}>{item.subtitle}</Text> : null}
              {item.attributes?.map((a) => (
                <Text key={a.key} style={st.itemSub}>{a.key}: {a.value.startsWith('http') ? 'צורף ✓' : a.value}</Text>
              ))}
              <Text style={st.itemPrice}>{item.currency}{item.price * item.quantity}</Text>
            </View>
            <View style={st.qtyCol}>
              <Pressable style={st.qtyBtn} onPress={() => cart.setQty(item.key, item.quantity + 1)}>
                <Text style={st.qtyBtnText}>+</Text>
              </Pressable>
              <Text style={st.qty}>{item.quantity}</Text>
              <Pressable style={st.qtyBtn} onPress={() => cart.setQty(item.key, item.quantity - 1)}>
                <Text style={st.qtyBtnText}>−</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {cart.count >= 8 && cart.count < 11 && (
          <View style={st.bulkNudge}>
            <Text style={st.bulkText}>עוד {11 - cart.count} פריטים והנחת הכמות נכנסת אוטומטית!</Text>
          </View>
        )}
      </ScrollView>

      <View style={st.footer}>
        <View style={st.totalRow}>
          <Text style={st.totalValue}>₪{cart.total}</Text>
          <Text style={st.totalLabel}>סה"כ ({cart.count} פריטים)</Text>
        </View>
        <Pressable style={[st.checkoutBtn, busy && st.checkoutBtnBusy]} onPress={checkout} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={C.onAccent} />
          ) : (
            <Text style={st.checkoutText}>מעבר לתשלום מאובטח ←</Text>
          )}
        </Pressable>
        <Text style={st.secureNote}>התשלום מתבצע בדף המאובטח של החנות</Text>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'right', padding: S.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  empty: { color: C.text, fontSize: 18, fontWeight: '700' },
  hint: { color: C.textDim, fontSize: 14, textAlign: 'center', marginTop: S.sm, lineHeight: 22 },
  scroll: { paddingHorizontal: S.md, paddingBottom: 170, gap: S.sm },
  card: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.sm,
    gap: S.sm,
    alignItems: 'center',
  },
  thumb: { width: 72, height: 72, borderRadius: R.sm },
  noThumb: { backgroundColor: C.surfaceHi },
  info: { flex: 1 },
  itemTitle: { color: C.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  itemSub: { color: C.textDim, fontSize: 12, textAlign: 'right', marginTop: 2 },
  itemPrice: { color: C.accent, fontSize: 15, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  qtyCol: { alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: R.sm,
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  qtyBtnText: { color: C.accent, fontSize: 18, fontWeight: '800' },
  qty: { color: C.text, fontSize: 15, fontWeight: '700' },
  bulkNudge: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: R.md,
    padding: S.sm,
    marginTop: S.xs,
  },
  bulkText: { color: C.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: S.md,
    backgroundColor: '#0d0d0dee',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: S.sm },
  totalLabel: { color: C.textDim, fontSize: 15 },
  totalValue: { color: C.text, fontSize: 18, fontWeight: '800' },
  checkoutBtn: {
    backgroundColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 15,
    alignItems: 'center',
  },
  checkoutBtnBusy: { opacity: 0.7 },
  checkoutText: { color: C.onAccent, fontSize: 17, fontWeight: '800' },
  secureNote: { color: C.textDim, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
