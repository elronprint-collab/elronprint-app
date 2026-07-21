import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
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
  { name: 'אסיסטנט', family: 'Assistant' },
  { name: 'רוביק', family: 'Rubik' },
  { name: 'ורלה', family: 'VarelaRound' },
  { name: 'סואץ', family: 'SuezOne' },
  { name: 'סקולר', family: 'SecularOne' },
  { name: 'קרנטינה', family: 'Karantina' },
  { name: 'כתב יד', family: 'AmaticSC' },
];

const TEXT_COLORS = [
  '#ffffff', '#000000', '#00fc25', '#ffd400', '#ff3b6b',
  '#37a7ff', '#ff7a00', '#a259ff', '#00d1c1', '#c0c0c0',
];

// אזור ההדפסה בתצוגה
const AREA_W = 230;
const AREA_H = 280;

type Layer = {
  id: number;
  text: string;
  font: (typeof FONTS)[number];
  color: string;
  size: number; // px
  x: number; // מרכז, יחסי לאזור
  y: number;
  rotation: number; // מעלות
  outline: boolean;
};

let nextId = 1;

function newLayer(): Layer {
  return {
    id: nextId++,
    text: 'הטקסט שלי',
    font: FONTS[0],
    color: '#ffffff',
    size: 26,
    x: AREA_W / 2,
    y: AREA_H / 2,
    rotation: 0,
    outline: false,
  };
}

function DraggableText({
  layer,
  selected,
  onSelect,
  onMove,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const start = useRef({ x: layer.x, y: layer.y });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        start.current = { x: layer.x, y: layer.y };
        onSelect();
      },
      onPanResponderMove: (_e, g) => {
        const nx = Math.min(AREA_W - 8, Math.max(8, start.current.x + g.dx));
        const ny = Math.min(AREA_H - 8, Math.max(8, start.current.y + g.dy));
        onMove(nx, ny);
      },
    }),
  ).current;

  // עדכון נקודת ההתחלה כשהשכבה זזה מבחוץ
  start.current = selected ? start.current : { x: layer.x, y: layer.y };

  return (
    <View
      {...pan.panHandlers}
      style={[
        st.layerWrap,
        {
          left: layer.x,
          top: layer.y,
          transform: [{ translateX: '-50%' as never }, { translateY: '-50%' as never }, { rotate: `${layer.rotation}deg` }],
        },
        selected && st.layerSelected,
      ]}
    >
      <Text
        style={[
          {
            fontFamily: layer.font.family,
            color: layer.color,
            fontSize: layer.size,
            textAlign: 'center',
          },
          layer.outline && {
            textShadowColor: layer.color === '#000000' ? '#ffffff' : '#000000',
            textShadowRadius: 3,
            textShadowOffset: { width: 0, height: 0 },
          },
        ]}
        numberOfLines={3}
      >
        {layer.text}
      </Text>
    </View>
  );
}

export default function Studio() {
  const [shirt, setShirt] = useState(SHIRT_COLORS[0]);
  const [size, setSize] = useState('M');
  const [localImg, setLocalImg] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [aiBusy, setAiBusy] = useState<null | 'bg' | 'up' | 'remix'>(null);

  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const cart = useCart();
  const hasDesign = !!cloudUrl || layers.some((l) => l.text.trim());

  function updateSelected(patch: Partial<Layer>) {
    if (selectedId == null) return;
    setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)));
  }

  function addLayer() {
    const l = newLayer();
    setLayers((ls) => [...ls, l]);
    setSelectedId(l.id);
  }

  function removeSelected() {
    if (selectedId == null) return;
    setLayers((ls) => ls.filter((l) => l.id !== selectedId));
    setSelectedId(null);
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('אין גישה לגלריה', 'אפשרו גישה בהגדרות כדי להעלות עיצוב');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
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

  async function runAi(kind: 'bg' | 'up' | 'remix') {
    if (!cloudUrl || aiBusy || uploading) return;
    setAiBusy(kind);
    try {
      let resultUrl: string;
      if (kind === 'up') resultUrl = await upscale(cloudUrl);
      else if (kind === 'bg') resultUrl = await removeBackground(cloudUrl);
      else resultUrl = await reimagine(await toDataUrl(localImg ?? cloudUrl));
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
      layers
        .filter((l) => l.text.trim())
        .forEach((l, i) => {
          attributes.push(
            { key: `טקסט ${i + 1}`, value: l.text.trim() },
            {
              key: `טקסט ${i + 1} — עיצוב`,
              value: `פונט ${l.font.name} · צבע ${l.color} · גודל ${l.size}px · מיקום ${Math.round(
                (l.x / AREA_W) * 100,
              )}%,${Math.round((l.y / AREA_H) * 100)}% · סיבוב ${l.rotation}°${l.outline ? ' · מתאר' : ''}`,
            },
          );
        });

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
            {localImg && <Image source={{ uri: localImg }} style={st.printImg} contentFit="contain" />}
            {!localImg && layers.length === 0 && (
              <Text style={[st.printHint, { color: lightShirt ? '#00000066' : '#ffffff66' }]}>
                אזור ההדפסה
              </Text>
            )}
            {layers.map((l) => (
              <DraggableText
                key={l.id}
                layer={l}
                selected={l.id === selectedId}
                onSelect={() => setSelectedId(l.id)}
                onMove={(x, y) => setLayers((ls) => ls.map((li) => (li.id === l.id ? { ...li, x, y } : li)))}
              />
            ))}
          </View>
          {uploading && (
            <View style={st.uploadOverlay}>
              <ActivityIndicator color={C.accent} size="large" />
              <Text style={st.uploadText}>מעלה את העיצוב…</Text>
            </View>
          )}
        </View>
        {layers.length > 0 && <Text style={st.dragHint}>גררו את הטקסט למיקום הרצוי · הקישו לבחירה</Text>}
        {cloudUrl && !uploading && <Text style={st.okText}>✓ העיצוב נשמר בענן</Text>}

        {/* הוספת טקסט / מחיקה */}
        <View style={st.rowSpread}>
          {selected && (
            <Pressable style={st.deleteBtn} onPress={removeSelected}>
              <Text style={st.deleteText}>🗑 מחיקה</Text>
            </Pressable>
          )}
          <Pressable style={st.addTextBtn} onPress={addLayer}>
            <Text style={st.addTextBtnText}>+ הוספת טקסט</Text>
          </Pressable>
        </View>

        {/* עורך הטקסט הנבחר */}
        {selected && (
          <View style={st.editor}>
            <TextInput
              style={[st.input, { fontFamily: selected.font.family }]}
              value={selected.text}
              onChangeText={(t) => updateSelected({ text: t })}
              placeholder="כתבו כאן…"
              placeholderTextColor={C.textDim}
              maxLength={60}
              multiline
            />

            <Text style={st.subLabel}>פונט</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.fontRow}>
              {FONTS.map((f) => (
                <Pressable
                  key={f.family}
                  onPress={() => updateSelected({ font: f })}
                  style={[st.fontBtn, selected.font.family === f.family && st.btnActive]}
                >
                  <Text
                    style={[
                      st.fontText,
                      { fontFamily: f.family },
                      selected.font.family === f.family && st.textActive,
                    ]}
                  >
                    {f.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={st.subLabel}>צבע</Text>
            <View style={st.row}>
              {TEXT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => updateSelected({ color: c })}
                  style={[st.swatchSm, { backgroundColor: c }, selected.color === c && st.swatchActive]}
                />
              ))}
            </View>

            <View style={st.sliderRow}>
              <Text style={st.sliderValue}>{selected.size}</Text>
              <Slider
                style={st.slider}
                minimumValue={12}
                maximumValue={64}
                step={1}
                value={selected.size}
                onValueChange={(v) => updateSelected({ size: Math.round(v) })}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor={C.border}
                thumbTintColor={C.accent}
              />
              <Text style={st.sliderLabel}>גודל</Text>
            </View>

            <View style={st.sliderRow}>
              <Text style={st.sliderValue}>{selected.rotation}°</Text>
              <Slider
                style={st.slider}
                minimumValue={-45}
                maximumValue={45}
                step={1}
                value={selected.rotation}
                onValueChange={(v) => updateSelected({ rotation: Math.round(v) })}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor={C.border}
                thumbTintColor={C.accent}
              />
              <Text style={st.sliderLabel}>סיבוב</Text>
            </View>

            <Pressable
              style={[st.outlineBtn, selected.outline && st.btnActive]}
              onPress={() => updateSelected({ outline: !selected.outline })}
            >
              <Text style={[st.sizeText, selected.outline && st.textActive]}>קו מתאר לטקסט</Text>
            </Pressable>
          </View>
        )}

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
            <Pressable key={s} onPress={() => setSize(s)} style={[st.sizeBtn, size === s && st.btnActive]}>
              <Text style={[st.sizeText, size === s && st.textActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* העלאת עיצוב */}
        <Pressable style={st.uploadBtn} onPress={pickImage} disabled={uploading}>
          <Text style={st.uploadBtnText}>{localImg ? 'החלפת תמונה' : 'העלאת עיצוב מהגלריה'}</Text>
        </Pressable>

        <Pressable
          style={[st.nextBtn, (!hasDesign || uploading || ordering) && st.nextBtnDisabled]}
          disabled={!hasDesign || uploading || ordering}
          onPress={continueToOrder}
        >
          {ordering ? <ActivityIndicator color={C.onAccent} /> : <Text style={st.nextBtnText}>המשך להזמנה ←</Text>}
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
    height: 360,
    borderRadius: R.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  printArea: {
    width: AREA_W,
    height: AREA_H,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  printHint: { fontSize: 14, fontWeight: '600' },
  layerWrap: { position: 'absolute', padding: 4, maxWidth: AREA_W - 8 },
  layerSelected: {
    borderWidth: 1,
    borderColor: C.accent,
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  dragHint: { color: C.textDim, fontSize: 12, textAlign: 'center', marginTop: 6 },
  uploadOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
  },
  uploadText: { color: C.text, fontSize: 15, fontWeight: '600' },
  okText: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  rowSpread: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: S.sm,
    marginTop: S.md,
  },
  addTextBtn: {
    backgroundColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  addTextBtnText: { color: C.onAccent, fontSize: 15, fontWeight: '800' },
  deleteBtn: {
    borderWidth: 1.5,
    borderColor: C.danger,
    borderRadius: R.full,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  deleteText: { color: C.danger, fontSize: 14, fontWeight: '800' },
  editor: {
    marginTop: S.md,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
  },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    color: C.text,
    fontSize: 17,
    padding: S.md,
    minHeight: 52,
    textAlign: 'right',
  },
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
    fontSize: 13,
    fontWeight: '700',
    marginTop: S.md,
    marginBottom: S.sm,
    textAlign: 'right',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, justifyContent: 'flex-end' },
  fontRow: { gap: S.sm, flexDirection: 'row' },
  swatch: { width: 44, height: 44, borderRadius: R.full, borderWidth: 2, borderColor: C.border },
  swatchSm: { width: 34, height: 34, borderRadius: R.full, borderWidth: 2, borderColor: C.border },
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
  btnActive: { borderColor: C.accent, backgroundColor: C.surfaceHi },
  sizeText: { color: C.textDim, fontSize: 15, fontWeight: '700' },
  textActive: { color: C.accent },
  fontBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  fontText: { color: C.textDim, fontSize: 16 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', marginTop: S.md, gap: S.sm },
  slider: { flex: 1, height: 36 },
  sliderLabel: { color: C.text, fontSize: 14, fontWeight: '700', width: 44, textAlign: 'right' },
  sliderValue: { color: C.accent, fontSize: 13, fontWeight: '800', width: 40 },
  outlineBtn: {
    marginTop: S.md,
    paddingVertical: 10,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
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
