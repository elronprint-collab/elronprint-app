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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { reimagine, removeBackground, toDataUrl, upscale } from '../../lib/ai';
import { useCart } from '../../lib/cart';
import { uploadImage, uploadRemote } from '../../lib/cloudinary';
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

const FONTS = [
  { name: 'חיבו', family: 'Heebo' },
  { name: 'רוביק', family: 'Rubik' },
  { name: 'סקולר', family: 'SecularOne' },
  { name: 'כתב יד', family: 'AmaticSC' },
];

const TEXT_COLORS = ['#ffffff', '#000000', '#00fc25', '#ffd400', '#ff3b6b', '#37a7ff'];

const TEXT_SIZES = [
  { name: 'קטן', px: 16 },
  { name: 'בינוני', px: 24 },
  { name: 'גדול', px: 34 },
];

const POSITIONS = [
  { name: 'למעלה', key: 'top' },
  { name: 'באמצע', key: 'center' },
  { name: 'למטה', key: 'bottom' },
] as const;

type PositionKey = (typeof POSITIONS)[number]['key'];

export default function Studio() {
  const [shirt, setShirt] = useState(SHIRT_COLORS[0]);
  const [size, setSize] = useState('M');
  const [localImg, setLocalImg] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ordering, setOrdering] = useState(false);

  // כלי הטקסט
  const [text, setText] = useState('');
  const [font, setFont] = useState(FONTS[0]);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [textSize, setTextSize] = useState(TEXT_SIZES[1]);
  const [position, setPosition] = useState<PositionKey>('bottom');

  const cart = useCart();
  const hasDesign = !!cloudUrl || text.trim().length > 0;

  const [aiBusy, setAiBusy] = useState<null | 'bg' | 'up' | 'remix'>(null);

  async function runAi(kind: 'bg' | 'up' | 'remix') {
    if (!cloudUrl || aiBusy || uploading) return;
    setAiBusy(kind);
    try {
      let resultUrl: string;
      if (kind === 'up') {
        resultUrl = await upscale(cloudUrl);
      } else if (kind === 'bg') {
        resultUrl = await removeBackground(cloudUrl);
      } else {
        const dataUrl = await toDataUrl(localImg ?? cloudUrl);
        resultUrl = await reimagine(dataUrl);
      }
      // שמירה קבועה בענן של אלרון פרינט (אם נכשל — נשתמש בקישור הזמני)
      try {
        resultUrl = await uploadRemote(resultUrl);
      } catch {}
      setLocalImg(resultUrl);
      setCloudUrl(resultUrl);
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'הפעולה נכשלה, נסו שוב');
    } finally {
      setAiBusy(null);
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

  async function continueToOrder() {
    if (!hasDesign || ordering || uploading) return;
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

      const attributes = [
        { key: 'צבע חולצה', value: shirt.name },
        { key: 'מידה', value: size },
      ];
      if (cloudUrl) attributes.push({ key: 'קובץ עיצוב', value: cloudUrl });
      if (text.trim()) {
        attributes.push(
          { key: 'טקסט להדפסה', value: text.trim() },
          { key: 'פונט', value: font.name },
          { key: 'צבע טקסט', value: textColor },
          { key: 'גודל טקסט', value: textSize.name },
          { key: 'מיקום טקסט', value: POSITIONS.find((p) => p.key === position)?.name ?? '' },
        );
      }

      cart.add({
        variantId: variant.id,
        title: 'חולצה בעיצוב אישי',
        subtitle: `${shirt.name} · ${size}`,
        image: cloudUrl,
        price: Number(variant.price),
        currency: variant.currency,
        quantity: 1,
        attributes,
      });
      router.push('/cart');
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו להוסיף לעגלה, נסו שוב');
    } finally {
      setOrdering(false);
    }
  }

  const lightShirt = shirt.hex === '#f2f2f2';

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
        <Text style={st.title}>סטודיו עיצוב</Text>

        {/* תצוגה מקדימה */}
        <View style={[st.shirtPreview, { backgroundColor: shirt.hex }]}>
          <View style={[st.printArea, { borderColor: lightShirt ? '#00000022' : '#ffffff22' }]}>
            {localImg ? (
              <Image source={{ uri: localImg }} style={st.printImg} contentFit="contain" />
            ) : !text.trim() ? (
              <Text style={[st.printHint, { color: lightShirt ? '#00000066' : '#ffffff66' }]}>
                אזור ההדפסה
              </Text>
            ) : null}
            {text.trim().length > 0 && (
              <Text
                style={[
                  st.overlayText,
                  {
                    fontFamily: font.family,
                    color: textColor,
                    fontSize: textSize.px,
                    top: position === 'top' ? 8 : undefined,
                    bottom: position === 'bottom' ? 8 : undefined,
                  },
                  position === 'center' && st.overlayCenter,
                ]}
                numberOfLines={3}
              >
                {text}
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

        {/* כלי AI */}
        {cloudUrl && !uploading && (
          <>
            <Text style={st.label}>שדרוג העיצוב עם AI</Text>
            <View style={st.row}>
              {(
                [
                  { kind: 'bg', label: 'הסרת רקע' },
                  { kind: 'up', label: 'שיפור חדות' },
                  { kind: 'remix', label: 'עיצוב מחדש ✨' },
                ] as const
              ).map((b) => (
                <Pressable
                  key={b.kind}
                  onPress={() => runAi(b.kind)}
                  disabled={!!aiBusy}
                  style={[st.aiBtn, aiBusy === b.kind && st.aiBtnBusy]}
                >
                  {aiBusy === b.kind ? (
                    <ActivityIndicator color={C.accent} size="small" />
                  ) : (
                    <Text style={st.aiBtnText}>{b.label}</Text>
                  )}
                </Pressable>
              ))}
            </View>
            {aiBusy && <Text style={st.hint}>העיבוד לוקח עד חצי דקה…</Text>}
          </>
        )}

        {/* צבע חולצה */}
        <Text style={st.label}>צבע החולצה</Text>
        <View style={st.row}>
          {SHIRT_COLORS.map((c) => (
            <Pressable
              key={c.hex}
              onPress={() => setShirt(c)}
              style={[st.swatch, { backgroundColor: c.hex }, shirt.hex === c.hex && st.swatchActive]}
              accessibilityLabel={c.name}
            />
          ))}
        </View>
        <Text style={st.hint}>{shirt.name}</Text>

        {/* מידה */}
        <Text style={st.label}>מידה</Text>
        <View style={st.row}>
          {SIZES.map((s) => (
            <Pressable key={s} onPress={() => setSize(s)} style={[st.sizeBtn, size === s && st.sizeBtnActive]}>
              <Text style={[st.sizeText, size === s && st.sizeTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* טקסט על החולצה */}
        <Text style={st.label}>טקסט על החולצה</Text>
        <TextInput
          style={[st.input, { fontFamily: font.family }]}
          value={text}
          onChangeText={setText}
          placeholder="כתבו כאן את הכיתוב…"
          placeholderTextColor={C.textDim}
          maxLength={60}
          multiline
        />

        {text.trim().length > 0 && (
          <>
            <Text style={st.subLabel}>פונט</Text>
            <View style={st.row}>
              {FONTS.map((f) => (
                <Pressable
                  key={f.family}
                  onPress={() => setFont(f)}
                  style={[st.fontBtn, font.family === f.family && st.sizeBtnActive]}
                >
                  <Text
                    style={[st.fontText, { fontFamily: f.family }, font.family === f.family && st.sizeTextActive]}
                  >
                    {f.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={st.subLabel}>צבע הטקסט</Text>
            <View style={st.row}>
              {TEXT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setTextColor(c)}
                  style={[
                    st.swatchSm,
                    { backgroundColor: c },
                    textColor === c && st.swatchActive,
                  ]}
                />
              ))}
            </View>

            <Text style={st.subLabel}>גודל</Text>
            <View style={st.row}>
              {TEXT_SIZES.map((ts) => (
                <Pressable
                  key={ts.name}
                  onPress={() => setTextSize(ts)}
                  style={[st.sizeBtn, textSize.name === ts.name && st.sizeBtnActive]}
                >
                  <Text style={[st.sizeText, textSize.name === ts.name && st.sizeTextActive]}>{ts.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={st.subLabel}>מיקום</Text>
            <View style={st.row}>
              {POSITIONS.map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => setPosition(p.key)}
                  style={[st.sizeBtn, position === p.key && st.sizeBtnActive]}
                >
                  <Text style={[st.sizeText, position === p.key && st.sizeTextActive]}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* העלאת עיצוב */}
        <Pressable style={st.uploadBtn} onPress={pickImage} disabled={uploading}>
          <Text style={st.uploadBtnText}>{localImg ? 'החלפת תמונה' : 'העלאת עיצוב מהגלריה'}</Text>
        </Pressable>

        <Pressable
          style={[st.nextBtn, (!hasDesign || uploading || ordering) && st.nextBtnDisabled]}
          disabled={!hasDesign || uploading || ordering}
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
  overlayText: {
    position: 'absolute',
    left: 4,
    right: 4,
    textAlign: 'center',
  },
  overlayCenter: { top: '42%' },
  uploadOverlay: {
    ...(StyleSheet.absoluteFill as object),
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
  subLabel: {
    color: C.textDim,
    fontSize: 14,
    fontWeight: '700',
    marginTop: S.md,
    marginBottom: S.sm,
    textAlign: 'right',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, justifyContent: 'flex-end' },
  swatch: { width: 44, height: 44, borderRadius: R.full, borderWidth: 2, borderColor: C.border },
  swatchSm: { width: 36, height: 36, borderRadius: R.full, borderWidth: 2, borderColor: C.border },
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
  aiBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    minWidth: 104,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: 'center',
  },
  aiBtnBusy: { opacity: 0.7 },
  aiBtnText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  fontBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: R.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  fontText: { color: C.textDim, fontSize: 16 },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    color: C.text,
    fontSize: 17,
    padding: S.md,
    minHeight: 56,
    textAlign: 'right',
  },
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
