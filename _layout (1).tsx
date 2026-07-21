import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '../../lib/cart';
import { uploadImage } from '../../lib/cloudinary';
import { fetchCustomProduct } from '../../lib/shopify';
import { C, R, S } from '../../lib/theme';

const SHIRT_COLORS = [
  { name: 'שחור', hex: '#1b1b1b' },
  { name: 'לבן', hex: '#f2f2f2' },
  { name: 'אפור', hex: '#8a8a8a' },
  { name: 'כחול נייבי', hex: '#1d2a4d' },
  { name: 'אדום', hex: '#b3202a' },
];

const SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];

export default function Studio() {
  const [shirt, setShirt] = useState(SHIRT_COLORS[0]);
  const [size, setSize] = useState('M');
  const [localImg, setLocalImg] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const cart = useCart();

  async function continueToOrder() {
    if (!cloudUrl || ordering) return;
    setOrdering(true);
    try {
      const product = await fetchCustomProduct();
      if (!product) throw new Error('מוצר ההדפסה לא נמצא בחנות');
      const variant =
        product.variants.find(
          (v) => v.available && v.options.some((o) => o.value.toUpperCase() === size.toUpperCase()),
        ) ??
        product.variants.find((v) => v.available) ??
        product.variants[0];
      if (!variant) throw new Error('לא נמצאה וריאציה זמינה');
      cart.add({
        variantId: variant.id,
        title: 'חולצה בעיצוב אישי',
        subtitle: `${shirt.name} · ${size}`,
        image: cloudUrl,
        price: Number(variant.price),
        currency: variant.currency,
        quantity: 1,
        attributes: [
          { key: 'קובץ עיצוב', value: cloudUrl },
          { key: 'צבע חולצה', value: shirt.name },
          { key: 'מידה', value: size },
        ],
      });
      router.push('/cart');
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו להוסיף לעגלה, נסו שוב');
    } finally {
      setOrdering(false);
    }
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('אין גישה לגלריה', 'אפשרו גישה בהגדרות כדי להעלות עיצוב');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setLocalImg(uri);
    setUploading(true);
    setCloudUrl(null);
    try {
      const url = await uploadImage(uri);
      setCloudUrl(url);
    } catch {
      Alert.alert('שגיאה', 'העלאת התמונה נכשלה. בדקו חיבור לאינטרנט ונסו שוב.');
    } finally {
      setUploading(false);
    }
  }

  const lightShirt = shirt.hex === '#f2f2f2';

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.scroll}>
        <Text style={st.title}>סטודיו עיצוב</Text>

        {/* תצוגה מקדימה */}
        <View style={[st.shirtPreview, { backgroundColor: shirt.hex }]}>
          <View style={[st.printArea, { borderColor: lightShirt ? '#00000022' : '#ffffff22' }]}>
            {localImg ? (
              <Image source={{ uri: localImg }} style={st.printImg} contentFit="contain" />
            ) : (
              <Text style={[st.printHint, { color: lightShirt ? '#00000066' : '#ffffff66' }]}>
                אזור ההדפסה
              </Text>
            )}
          </View>
          {uploading && (
            <View style={st.uploadOverlay}>
              <ActivityIndicator color={C.accent} size="large" />
              <Text style={st.uploadText}>מעלה את העיצוב…</Text>
            </View>
          )}
        </View>
        {cloudUrl && !uploading && <Text style={st.okText}>✓ העיצוב נשמר בענן</Text>}

        {/* צבע חולצה */}
        <Text style={st.label}>צבע החולצה</Text>
        <View style={st.row}>
          {SHIRT_COLORS.map((c) => (
            <Pressable
              key={c.hex}
              onPress={() => setShirt(c)}
              style={[
                st.swatch,
                { backgroundColor: c.hex },
                shirt.hex === c.hex && st.swatchActive,
              ]}
              accessibilityLabel={c.name}
            />
          ))}
        </View>
        <Text style={st.hint}>{shirt.name}</Text>

        {/* מידה */}
        <Text style={st.label}>מידה</Text>
        <View style={st.row}>
          {SIZES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSize(s)}
              style={[st.sizeBtn, size === s && st.sizeBtnActive]}
            >
              <Text style={[st.sizeText, size === s && st.sizeTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* העלאת עיצוב */}
        <Pressable style={st.uploadBtn} onPress={pickImage} disabled={uploading}>
          <Text style={st.uploadBtnText}>
            {localImg ? 'החלפת תמונה' : 'העלאת עיצוב מהגלריה'}
          </Text>
        </Pressable>

        <Pressable
          style={[st.nextBtn, (!cloudUrl || uploading || ordering) && st.nextBtnDisabled]}
          disabled={!cloudUrl || uploading || ordering}
          onPress={continueToOrder}
        >
          {ordering ? (
            <ActivityIndicator color={C.onAccent} />
          ) : (
            <Text style={st.nextBtnText}>המשך להזמנה ←</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.md, paddingBottom: S.xl },
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'right' },
  shirtPreview: {
    marginTop: S.md,
    height: 320,
    borderRadius: R.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  printArea: {
    width: 190,
    height: 230,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printImg: { width: '100%', height: '100%' },
  printHint: { fontSize: 14, fontWeight: '600' },
  uploadOverlay: {
    ...StyleSheet.absoluteFill as object,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
  },
  uploadText: { color: C.text, fontSize: 15, fontWeight: '600' },
  okText: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: S.sm, textAlign: 'center' },
  label: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: S.lg,
    marginBottom: S.sm,
    textAlign: 'right',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, justifyContent: 'flex-end' },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: R.full,
    borderWidth: 2,
    borderColor: C.border,
  },
  swatchActive: { borderColor: C.accent, borderWidth: 3 },
  hint: { color: C.textDim, fontSize: 13, marginTop: 6, textAlign: 'right' },
  sizeBtn: {
    minWidth: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  sizeBtnActive: { borderColor: C.accent, backgroundColor: C.surfaceHi },
  sizeText: { color: C.textDim, fontSize: 15, fontWeight: '700' },
  sizeTextActive: { color: C.accent },
  uploadBtn: {
    marginTop: S.xl,
    borderRadius: R.full,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  uploadBtnText: { color: C.accent, fontSize: 16, fontWeight: '800' },
  nextBtn: {
    marginTop: S.md,
    backgroundColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 15,
    alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: C.surfaceHi },
  nextBtnText: { color: C.onAccent, fontSize: 17, fontWeight: '800' },
});
