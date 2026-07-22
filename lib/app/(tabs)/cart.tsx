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
import { router } from 'expo-router';
import { CartDesign, useCart } from '../../lib/cart';
import { createCheckout } from '../../lib/shopify';
import { C, R, S } from '../../lib/theme';

const MINI = 0.34;

function MiniPreview({ design }: { design: CartDesign }) {
  const it = design.imageTransform;
  return (
    <View style={[st.mini, { backgroundColor: design.shirtHex }]}>
      <View style={st.miniArea}>
        {design.image && it && (
          <View
            style={{
              position: 'absolute',
              left: (it.x - it.w / 2) * MINI,
              top: (it.y - it.h / 2) * MINI,
              width: it.w * MINI,
              height: it.h * MINI,
              opacity: it.opacity / 100,
              borderRadius: (it.cornerRadius ?? 0) * MINI,
              overflow: 'hidden',
              borderWidth: !it.borderStyle || it.borderStyle === 'none' ? 0 : (it.borderWidth ?? 0) * MINI,
              borderColor: it.borderColor ?? '#ffffff',
              borderStyle: !it.borderStyle || it.borderStyle === 'none' ? 'solid' : it.borderStyle,
              transform: [
                { rotate: `${it.rotation}deg` },
                { scaleX: it.flipH ? -1 : 1 },
                { scaleY: it.flipV ? -1 : 1 },
              ],
            }}
          >
            <Image
              source={{ uri: design.image }}
              style={[
                st.miniImg,
                {
                  width: `${(it.cropScale ?? 1) * 100}%` as any,
                  height: `${(it.cropScale ?? 1) * 100}%` as any,
                  left: (it.cropOffsetX ?? 0) * MINI,
                  top: (it.cropOffsetY ?? 0) * MINI,
                },
              ]}
              contentFit="contain"
            />
          </View>
        )}
        {design.image && !it && <Image source={{ uri: design.image }} style={st.miniImg} contentFit="contain" />}
        {design.layers.map((l, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: l.x * MINI,
              top: l.y * MINI,
              width: l.width != null ? l.width * MINI : undefined,
              opacity: l.opacity / 100,
              transform: [
                { translateX: '-50%' as never },
                { translateY: '-50%' as never },
                { rotate: `${l.rotation}deg` },
                { scaleX: l.flipH ? -1 : 1 },
                { scaleY: l.flipV ? -1 : 1 },
              ],
            }}
          >
            <Text
              style={[
                {
                  fontFamily: l.fontFamily,
                  color: l.color,
                  fontSize: Math.max(6, l.size * MINI),
                  lineHeight: Math.max(7, l.size * l.lineHeight * MINI),
                  textAlign: l.align,
                  letterSpacing: l.spacing * MINI,
                  fontWeight: l.bold ? '700' : 'normal',
                  fontStyle: l.italic ? 'italic' : 'normal',
                  textDecorationLine:
                    l.underline && l.strikethrough
                      ? 'underline line-through'
                      : l.underline
                        ? 'underline'
                        : l.strikethrough
                          ? 'line-through'
                          : 'none',
                },
                l.highlight != null && { backgroundColor: l.highlight, paddingHorizontal: 2 },
                l.shadow && {
                  textShadowColor: '#00000099',
                  textShadowRadius: 2,
                  textShadowOffset: { width: 1, height: 1 },
                },
              ]}
              numberOfLines={2}
            >
              {l.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

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
        <View style={st.headerRow}>
          <Text style={st.title}>העגלה שלי</Text>
          <Pressable
            onPress={() => router.push('/shop')}
            style={st.backBtn}
          >
            <Text style={st.backText}>→ המשך קניות</Text>
          </Pressable>
        </View>
        <View style={st.center}>
          <Text style={st.empty}>העגלה ריקה</Text>
          <Text style={st.hint}>מעצבים חולצה בסטודיו או בוחרים מהחנות — והיא תופיע כאן</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.headerRow}>
        <Text style={st.title}>העגלה שלי</Text>
        <Pressable
          onPress={() => router.push('/shop')}
          style={st.backBtn}
        >
          <Text style={st.backText}>→ המשך קניות</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={st.scroll}>
        {cart.items.map((item) => (
          <View key={item.key} style={st.card}>
            {item.design ? (
              <MiniPreview design={item.design} />
            ) : item.image ? (
              <Image source={{ uri: item.image }} style={st.thumb} contentFit="cover" />
            ) : (
              <View style={[st.thumb, st.noThumb]} />
            )}
            <View style={st.info}>
              <Text style={st.itemTitle} numberOfLines={2}>{item.title}</Text>
              {item.subtitle ? <Text style={st.itemSub}>{item.subtitle}</Text> : null}
              {item.attributes
                ?.filter((a) => !a.key.includes('—') && !a.value.startsWith('http') && a.key !== 'צבע חולצה' && a.key !== 'מידה')
                .map((a) => (
                  <Text key={a.key} style={st.itemSub} numberOfLines={1}>
                    {a.key}: {a.value}
                  </Text>
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
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'right' },
  backBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: R.full,
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  backText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: S.md,
  },
  mini: {
    width: 86,
    height: 104,
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniArea: { width: 230 * 0.34, height: 280 * 0.34 },
  miniImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
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
