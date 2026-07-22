import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Modal,
  PanResponder,
  Platform,
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
import { fetchCustomProduct, fetchProducts, isConfigured, Product } from '../../lib/shopify';
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
  { name: 'אלף', family: 'Alef' },
  { name: 'פרנק ריהל', family: 'FrankRuhl' },
  { name: 'דוד', family: 'DavidLibre' },
  { name: 'מרים', family: 'MiriamLibre' },
  { name: 'בלפייר', family: 'Bellefair' },
  { name: 'פלקס', family: 'PlexHebrew' },
  { name: 'נוטו', family: 'NotoHebrew' },
  { name: 'נוטו סריף', family: 'NotoSerif' },
  { name: 'רש"י', family: 'Rashi' },
  { name: 'רהוט', family: 'Solitreo' },
];

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

const TEXT_COLORS = [
  '#ffffff', '#000000', '#00fc25', '#ffd400', '#ff3b6b',
  '#37a7ff', '#ff7a00', '#a259ff', '#00d1c1', '#c0c0c0',
];

const HIGHLIGHTS: (string | null)[] = [null, '#000000', '#ffffff', '#00fc25', '#ffd400', '#ff3b6b'];

const SYMBOLS = ['❤️', '⚡', '👑', '⭐', '🔥', '😎', '🎉', '🦄', '⚽', '🎸', '💪', '🌈'];

const ALIGNS = [
  { key: 'right', label: 'ימין' },
  { key: 'center', label: 'מרכז' },
  { key: 'left', label: 'שמאל' },
] as const;

// תיקון RTL: הסליידר מתהפך בממשק עברי, אז הופכים אותו חזרה
const SLIDER_INVERTED = Platform.OS === 'web' ? true : I18nManager.isRTL;

const AREA_W = 230;
const AREA_H = 280;

type Layer = {
  id: number;
  text: string;
  font: (typeof FONTS)[number];
  color: string;
  size: number;
  x: number;
  y: number;
  rotation: number;
  outline: boolean;
  bold: boolean;
  align: 'right' | 'center' | 'left';
  highlight: string | null;
  spacing: number;
  width?: number; // רוחב מפורש של תיבת הטקסט — נקבע כשגוררים ידית צד/פינה
};

type HandleKind = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

const HANDLES: { kind: HandleKind; leftPct: number; topPct: number; glyph: string }[] = [
  { kind: 'nw', leftPct: 0, topPct: 0, glyph: '⤡' },
  { kind: 'n', leftPct: 50, topPct: 0, glyph: '↕' },
  { kind: 'ne', leftPct: 100, topPct: 0, glyph: '⤢' },
  { kind: 'w', leftPct: 0, topPct: 50, glyph: '↔' },
  { kind: 'e', leftPct: 100, topPct: 50, glyph: '↔' },
  { kind: 'sw', leftPct: 0, topPct: 100, glyph: '⤢' },
  { kind: 's', leftPct: 50, topPct: 100, glyph: '↕' },
  { kind: 'se', leftPct: 100, topPct: 100, glyph: '⤡' },
];

const MIN_TEXT_SIZE = 12;
const MAX_TEXT_SIZE = 96;
const MIN_BOX_WIDTH = 40;
const MAX_BOX_WIDTH = AREA_W - 16;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// מחשב את השינוי בגודל/רוחב/מיקום לפי כיוון הידית שנגררת
function computeResizePatch(
  kind: HandleKind,
  dx: number,
  dy: number,
  base: { size: number; width: number; x: number },
): Partial<Layer> {
  switch (kind) {
    case 'se': {
      const diag = (dx + dy) / 2;
      return { size: clamp(Math.round(base.size + diag * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE), width: clamp(Math.round(base.width + diag), MIN_BOX_WIDTH, MAX_BOX_WIDTH) };
    }
    case 'sw': {
      const diag = (-dx + dy) / 2;
      return { size: clamp(Math.round(base.size + diag * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE), width: clamp(Math.round(base.width + diag), MIN_BOX_WIDTH, MAX_BOX_WIDTH) };
    }
    case 'ne': {
      const diag = (dx - dy) / 2;
      return { size: clamp(Math.round(base.size + diag * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE), width: clamp(Math.round(base.width + diag), MIN_BOX_WIDTH, MAX_BOX_WIDTH) };
    }
    case 'nw': {
      const diag = (-dx - dy) / 2;
      return { size: clamp(Math.round(base.size + diag * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE), width: clamp(Math.round(base.width + diag), MIN_BOX_WIDTH, MAX_BOX_WIDTH) };
    }
    case 'e':
      return {
        width: clamp(Math.round(base.width + dx), MIN_BOX_WIDTH, MAX_BOX_WIDTH),
        x: Math.round(base.x + dx / 2),
      };
    case 'w':
      return {
        width: clamp(Math.round(base.width - dx), MIN_BOX_WIDTH, MAX_BOX_WIDTH),
        x: Math.round(base.x + dx / 2),
      };
    case 's':
      return { size: clamp(Math.round(base.size + dy * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE) };
    case 'n':
      return { size: clamp(Math.round(base.size - dy * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE) };
  }
}

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
    bold: false,
    align: 'center',
    highlight: null,
    spacing: 0,
  };
}

// גרירת עכבר לידיות ההגדלה — נדרש רק בדפדפן מחשב (PanResponder של רקטיב-נייטיב מיועד למגע)
function webHandleHandlers(
  kind: HandleKind,
  layerRef: MutableRefObject<Layer>,
  measuredRef: MutableRefObject<{ w: number; h: number }>,
  onResize: (patch: Partial<Layer>) => void,
  onDragStart: () => void,
  onDragEnd: () => void,
) {
  return {
    onMouseDown: (e: any) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      const base = {
        size: layerRef.current.size,
        width: layerRef.current.width ?? measuredRef.current.w,
        x: layerRef.current.x,
      };
      const startX = e.clientX;
      const startY = e.clientY;
      onDragStart();
      const onMove = (ev: MouseEvent) => {
        onResize(computeResizePatch(kind, ev.clientX - startX, ev.clientY - startY, base));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        onDragEnd();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
  };
}

function useHandleResponder(
  kind: HandleKind,
  layerRef: MutableRefObject<Layer>,
  measuredRef: MutableRefObject<{ w: number; h: number }>,
  onResize: (patch: Partial<Layer>) => void,
  onDragStart: () => void,
  onDragEnd: () => void,
) {
  const base = useRef({ size: 0, width: 0, x: 0 });
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        base.current = {
          size: layerRef.current.size,
          width: layerRef.current.width ?? measuredRef.current.w,
          x: layerRef.current.x,
        };
        onDragStart();
      },
      onPanResponderMove: (_e, g) => {
        onResize(computeResizePatch(kind, g.dx, g.dy, base.current));
      },
      onPanResponderRelease: onDragEnd,
      onPanResponderTerminate: onDragEnd,
    }),
  ).current;
}

function DraggableText({
  layer,
  selected,
  onSelect,
  onMove,
  onResize,
  onDragStart,
  onDragEnd,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (patch: Partial<Layer>) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const start = useRef({ x: layer.x, y: layer.y });
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const measuredRef = useRef({ w: 100, h: 30 });
  // מצב לרינדור מיקום הידיות בפיקסלים — נדרש בנייד: אחוזים (%) ביחס לתיבה שמתאימה עצמה
  // אוטומטית לתוכן (auto-size) לא נפתרים באופן אמין ב-Yoga/RN Native כמו בדפדפן,
  // ולכן שם הידיות "זזות" ולא נשארות במקום. פיקסלים מדויקים פותרים את זה בשתי הפלטפורמות.
  const [measured, setMeasured] = useState({ w: 100, h: 30 });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        start.current = { x: layerRef.current.x, y: layerRef.current.y };
        onDragStart();
        onSelect();
      },
      onPanResponderMove: (_e, g) => {
        const nx = Math.min(AREA_W - 8, Math.max(8, start.current.x + g.dx));
        const ny = Math.min(AREA_H - 8, Math.max(8, start.current.y + g.dy));
        onMove(nx, ny);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: onDragEnd,
      onPanResponderTerminate: onDragEnd,
    }),
  ).current;

  // 8 ידיות מתיחה — פינות ("nw","ne","sw","se") ואמצע-צלעות ("n","s","e","w")
  const panNW = useHandleResponder('nw', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const panN = useHandleResponder('n', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const panNE = useHandleResponder('ne', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const panW = useHandleResponder('w', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const panE = useHandleResponder('e', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const panSW = useHandleResponder('sw', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const panS = useHandleResponder('s', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const panSE = useHandleResponder('se', layerRef, measuredRef, onResize, onDragStart, onDragEnd);
  const handlePanByKind: Record<HandleKind, ReturnType<typeof useHandleResponder>> = {
    nw: panNW,
    n: panN,
    ne: panNE,
    w: panW,
    e: panE,
    sw: panSW,
    s: panS,
    se: panSE,
  };

  start.current = selected ? start.current : { x: layer.x, y: layer.y };

  const shadow = layer.outline
    ? {
        textShadowColor: layer.color === '#000000' ? '#ffffff' : '#000000',
        textShadowRadius: 3,
        textShadowOffset: { width: 0, height: 0 },
      }
    : layer.bold
      ? { textShadowColor: layer.color, textShadowRadius: 0.8, textShadowOffset: { width: 0, height: 0 } }
      : null;

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => {
        const next = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        measuredRef.current = next;
        setMeasured(next);
      }}
      style={[
        st.layerWrap,
        layer.width != null && { width: layer.width },
        {
          left: layer.x,
          top: layer.y,
          transform: [
            { translateX: '-50%' as never },
            { translateY: '-50%' as never },
            { rotate: `${layer.rotation}deg` },
          ],
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
            textAlign: layer.align,
            letterSpacing: layer.spacing,
            fontWeight: layer.bold ? '700' : 'normal',
          },
          layer.highlight != null && {
            backgroundColor: layer.highlight,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 3,
          },
          shadow,
        ]}
        numberOfLines={layer.width != null ? undefined : 3}
      >
        {layer.text}
      </Text>
      {selected &&
        HANDLES.map(({ kind, leftPct, topPct }) => {
          const isCorner = kind.length === 2;
          const isVerticalBar = kind === 'w' || kind === 'e';
          const shape = isCorner ? st.handleCorner : isVerticalBar ? st.handleBarV : st.handleBarH;
          // בלי transform למרכוז — ב-RN באנדרואיד אזור המגע לא תמיד עוקב אחרי transform,
          // אז ממקמים בחישוב ישיר (הפינה השמאלית-עליונה של אזור המגע) כדי שהמגע יתאים בדיוק למה שרואים
          const HIT = 22;
          return (
            <View
              key={kind}
              {...(Platform.OS === 'web'
                ? webHandleHandlers(kind, layerRef, measuredRef, onResize, onDragStart, onDragEnd)
                : handlePanByKind[kind].panHandlers)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[
                st.resizeHandleHit,
                {
                  left: (leftPct / 100) * measured.w - HIT / 2,
                  top: (topPct / 100) * measured.h - HIT / 2,
                },
              ]}
            >
              <View style={shape} />
            </View>
          );
        })}
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

  // ביטול / חזרה
  type Snap = { layers: Layer[]; localImg: string | null; cloudUrl: string | null };
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const [, forceHistory] = useState(0);

  function currentSnap(): Snap {
    return { layers: layers.map((l) => ({ ...l })), localImg, cloudUrl };
  }

  function applySnap(sn: Snap) {
    setLayers(sn.layers);
    setLocalImg(sn.localImg);
    setCloudUrl(sn.cloudUrl);
    if (selectedId != null && !sn.layers.some((l) => l.id === selectedId)) setSelectedId(null);
  }

  function snapshot() {
    past.current.push(currentSnap());
    if (past.current.length > 40) past.current.shift();
    future.current = [];
    forceHistory((n) => n + 1);
  }

  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(currentSnap());
    applySnap(prev);
    forceHistory((n) => n + 1);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(currentSnap());
    applySnap(next);
    forceHistory((n) => n + 1);
  }

  function removeImage() {
    snapshot();
    setLocalImg(null);
    setCloudUrl(null);
  }

  function updateSelected(patch: Partial<Layer>, withSnapshot = true) {
    if (selectedId == null) return;
    if (withSnapshot) snapshot();
    setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)));
  }

  function addLayer() {
    snapshot();
    const l = newLayer();
    setLayers((ls) => [...ls, l]);
    setSelectedId(l.id);
  }

  function removeSelected() {
    if (selectedId == null) return;
    snapshot();
    setLayers((ls) => ls.filter((l) => l.id !== selectedId));
    setSelectedId(null);
  }

  const textEditSnapped = useRef(false);

  // השראה מהחנות + זום
  const [inspiration, setInspiration] = useState<Product[]>([]);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [hue, setHue] = useState(120);
  const [sat, setSat] = useState(100);
  const [light, setLight] = useState(50);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (isConfigured()) {
      fetchProducts(12)
        .then(setInspiration)
        .catch(() => {});
    }
  }, []);

  function addSymbol(char: string) {
    snapshot();
    const l = { ...newLayer(), text: char, size: 42 };
    setLayers((ls) => [...ls, l]);
    setSelectedId(l.id);
  }

  async function useTemplate(p: Product) {
    if (!p.image || uploading) return;
    snapshot();
    setLocalImg(p.image);
    setUploading(true);
    setCloudUrl(null);
    try {
      const url = await uploadRemote(p.image);
      setCloudUrl(url);
    } catch {
      Alert.alert('שגיאה', 'טעינת העיצוב נכשלה, נסו שוב');
      setLocalImg(null);
    } finally {
      setUploading(false);
    }
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
    snapshot();
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
          const details = [
            `פונט ${l.font.name}`,
            `צבע ${l.color}`,
            `גודל ${l.size}px`,
            l.width != null ? `רוחב תיבה ${l.width}px` : '',
            `מיקום ${Math.round((l.x / AREA_W) * 100)}%,${Math.round((l.y / AREA_H) * 100)}%`,
            l.rotation !== 0 ? `סיבוב ${l.rotation}°` : '',
            l.bold ? 'מודגש' : '',
            l.align !== 'center' ? `יישור ${ALIGNS.find((a) => a.key === l.align)?.label}` : '',
            l.highlight ? `רקע ${l.highlight}` : '',
            l.spacing > 0 ? `ריווח ${l.spacing}` : '',
            l.outline ? 'מתאר' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          attributes.push({ key: `טקסט ${i + 1}`, value: l.text.trim() }, { key: `טקסט ${i + 1} — עיצוב`, value: details });
        });

      cart.add({
        variantId: variant.id,
        title: 'חולצה בעיצוב אישי',
        subtitle: `${shirt.name} · ${size}`,
        image: cloudUrl,
        design: {
          shirtHex: shirt.hex,
          image: cloudUrl,
          layers: layers
            .filter((l) => l.text.trim())
            .map((l) => ({
              text: l.text,
              fontFamily: l.font.family,
              color: l.color,
              size: l.size,
              width: l.width,
              x: l.x,
              y: l.y,
              rotation: l.rotation,
              align: l.align,
              spacing: l.spacing,
              bold: l.bold,
              highlight: l.highlight,
              outline: l.outline,
            })),
        },
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

  const cart = useCart();
  const hasDesign = !!cloudUrl || layers.some((l) => l.text.trim());
  const lightShirt = shirt.hex === '#f2f2f2';

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={st.scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!scrollLocked}
      >
        <View style={st.headerRow}>
          <Text style={st.title}>סטודיו עיצוב</Text>
          <View style={st.historyRow}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.push('/'))}
              style={st.arrowBtn}
              hitSlop={4}
            >
              <Text style={st.navArrowText}>→</Text>
            </Pressable>
            <Pressable
              onPress={undo}
              disabled={past.current.length === 0}
              style={[st.arrowBtn, past.current.length === 0 && st.histBtnOff]}
            >
              <Text style={st.arrowText}>↶</Text>
            </Pressable>
            <Pressable
              onPress={redo}
              disabled={future.current.length === 0}
              style={[st.arrowBtn, future.current.length === 0 && st.histBtnOff]}
            >
              <Text style={st.arrowText}>↷</Text>
            </Pressable>
          </View>
        </View>

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
                onDragStart={() => {
                  snapshot();
                  setScrollLocked(true);
                }}
                onDragEnd={() => setScrollLocked(false)}
                onMove={(x, y) => setLayers((ls) => ls.map((li) => (li.id === l.id ? { ...li, x, y } : li)))}
                onResize={(patch) => setLayers((ls) => ls.map((li) => (li.id === l.id ? { ...li, ...patch } : li)))}
              />
            ))}
          </View>
          {uploading && (
            <View style={st.uploadOverlay}>
              <ActivityIndicator color={C.accent} size="large" />
              <Text style={st.uploadText}>מעלה את העיצוב…</Text>
            </View>
          )}
          <Pressable style={st.zoomBtn} onPress={() => setZoomOpen(true)} hitSlop={8}>
            <Text style={st.zoomBtnText}>🔍</Text>
          </Pressable>
          {localImg && !uploading && (
            <Pressable style={st.removeImgBtn} onPress={removeImage} hitSlop={8}>
              <Text style={st.removeImgText}>✕</Text>
            </Pressable>
          )}
        </View>
        {layers.length > 0 && <Text style={st.dragHint}>גררו את הטקסט למיקום הרצוי · הקישו לבחירה</Text>}
        {cloudUrl && !uploading && <Text style={st.okText}>✓ העיצוב נשמר בענן</Text>}

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

        {/* סמלים מהירים */}
        <Text style={st.subLabel}>סמלים מהירים</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.fontRow}>
          {SYMBOLS.map((sym) => (
            <Pressable key={sym} style={st.symbolBtn} onPress={() => addSymbol(sym)}>
              <Text style={st.symbolText}>{sym}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {selected && (
          <View style={st.editor}>
            <TextInput
              style={[st.input, { fontFamily: selected.font.family }]}
              value={selected.text}
              onFocus={() => {
                if (!textEditSnapped.current) {
                  snapshot();
                  textEditSnapped.current = true;
                }
              }}
              onBlur={() => {
                textEditSnapped.current = false;
              }}
              onChangeText={(t) => updateSelected({ text: t }, false)}
              placeholder="כתבו כאן…"
              placeholderTextColor={C.textDim}
              maxLength={60}
              multiline
            />

            {/* מודגש + יישור */}
            <View style={st.toolRow}>
              <View style={st.alignGroup}>
                {ALIGNS.map((a) => (
                  <Pressable
                    key={a.key}
                    onPress={() => updateSelected({ align: a.key })}
                    style={[st.alignBtn, selected.align === a.key && st.btnActive]}
                  >
                    <Text style={[st.sizeText, selected.align === a.key && st.textActive]}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => updateSelected({ bold: !selected.bold })}
                style={[st.boldBtn, selected.bold && st.btnActive]}
              >
                <Text style={[st.boldText, selected.bold && st.textActive]}>B</Text>
              </Pressable>
            </View>

            <Text style={st.subLabel}>פונט — 18 פונטים, גללו הצידה ←</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.fontRow}>
              {FONTS.map((f) => (
                <Pressable
                  key={f.family}
                  onPress={() => updateSelected({ font: f })}
                  style={[st.fontBtn, selected.font.family === f.family && st.btnActive]}
                >
                  <Text
                    style={[st.fontText, { fontFamily: f.family }, selected.font.family === f.family && st.textActive]}
                  >
                    {f.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={st.subLabel}>צבע — ולכל גוון אחר פתחו את הבורר 🎨</Text>
            <View style={st.row}>
              {TEXT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => updateSelected({ color: c })}
                  style={[st.swatchSm, { backgroundColor: c }, selected.color === c && st.swatchActive]}
                />
              ))}
            </View>

            <Pressable
              style={[st.outlineBtn, customOpen && st.btnActive]}
              onPress={() => setCustomOpen((v) => !v)}
            >
              <Text style={[st.sizeText, customOpen && st.textActive]}>🎨 כל צבע — בורר חופשי</Text>
            </Pressable>
            {customOpen && (
              <View style={st.customBox}>
                <View style={st.customHeader}>
                  <View style={[st.customSwatch, { backgroundColor: hslToHex(hue, sat, light) }]} />
                  <Pressable
                    style={st.applyBtn}
                    onPress={() => updateSelected({ color: hslToHex(hue, sat, light) })}
                  >
                    <Text style={st.applyText}>החלת הצבע</Text>
                  </Pressable>
                </View>
                <View style={st.sliderRow}>
                  <Slider
                    style={st.slider}
                    inverted={SLIDER_INVERTED}
                    minimumValue={0}
                    maximumValue={360}
                    step={1}
                    value={hue}
                    onValueChange={(v) => setHue(Math.round(v))}
                    minimumTrackTintColor={hslToHex(hue, 100, 50)}
                    maximumTrackTintColor={C.border}
                    thumbTintColor={hslToHex(hue, 100, 50)}
                  />
                  <Text style={st.sliderLabel}>גוון</Text>
                </View>
                <View style={st.sliderRow}>
                  <Slider
                    style={st.slider}
                    inverted={SLIDER_INVERTED}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={sat}
                    onValueChange={(v) => setSat(Math.round(v))}
                    minimumTrackTintColor={C.accent}
                    maximumTrackTintColor={C.border}
                    thumbTintColor={C.accent}
                  />
                  <Text style={st.sliderLabel}>עוצמה</Text>
                </View>
                <View style={st.sliderRow}>
                  <Slider
                    style={st.slider}
                    inverted={SLIDER_INVERTED}
                    minimumValue={5}
                    maximumValue={95}
                    step={1}
                    value={light}
                    onValueChange={(v) => setLight(Math.round(v))}
                    minimumTrackTintColor={C.accent}
                    maximumTrackTintColor={C.border}
                    thumbTintColor={C.accent}
                  />
                  <Text style={st.sliderLabel}>בהירות</Text>
                </View>
              </View>
            )}

            <Text style={st.subLabel}>רקע לטקסט (מרקר)</Text>
            <View style={st.row}>
              {HIGHLIGHTS.map((h) => (
                <Pressable
                  key={h ?? 'none'}
                  onPress={() => updateSelected({ highlight: h })}
                  style={[
                    st.swatchSm,
                    h ? { backgroundColor: h } : st.noneSwatch,
                    selected.highlight === h && st.swatchActive,
                  ]}
                >
                  {!h && <Text style={st.noneText}>✕</Text>}
                </Pressable>
              ))}
            </View>

            <View style={st.sliderRow}>
              <Text style={st.sliderValue}>{selected.size}</Text>
              <Slider
                style={st.slider}
                inverted={SLIDER_INVERTED}
                minimumValue={12}
                maximumValue={64}
                step={1}
                value={selected.size}
                onSlidingStart={snapshot}
                onValueChange={(v) => updateSelected({ size: Math.round(v) }, false)}
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
                inverted={SLIDER_INVERTED}
                minimumValue={-45}
                maximumValue={45}
                step={1}
                value={selected.rotation}
                onSlidingStart={snapshot}
                onValueChange={(v) => updateSelected({ rotation: Math.round(v) }, false)}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor={C.border}
                thumbTintColor={C.accent}
              />
              <Text style={st.sliderLabel}>סיבוב</Text>
            </View>

            <View style={st.sliderRow}>
              <Text style={st.sliderValue}>{selected.spacing}</Text>
              <Slider
                style={st.slider}
                inverted={SLIDER_INVERTED}
                minimumValue={0}
                maximumValue={12}
                step={1}
                value={selected.spacing}
                onSlidingStart={snapshot}
                onValueChange={(v) => updateSelected({ spacing: Math.round(v) }, false)}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor={C.border}
                thumbTintColor={C.accent}
              />
              <Text style={st.sliderLabel}>ריווח</Text>
            </View>

            <Pressable
              style={[st.outlineBtn, selected.outline && st.btnActive]}
              onPress={() => updateSelected({ outline: !selected.outline })}
            >
              <Text style={[st.sizeText, selected.outline && st.textActive]}>קו מתאר לטקסט</Text>
            </Pressable>
          </View>
        )}

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

        <Text style={st.label}>מידה</Text>
        <View style={st.row}>
          {SIZES.map((s) => (
            <Pressable key={s} onPress={() => setSize(s)} style={[st.sizeBtn, size === s && st.btnActive]}>
              <Text style={[st.sizeText, size === s && st.textActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* השראה מהעיצובים בחנות */}
        {inspiration.length > 0 && (
          <>
            <Text style={st.label}>התחלה מעיצוב מהחנות</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.fontRow}>
              {inspiration.map((p) =>
                p.image ? (
                  <Pressable key={p.id} style={st.inspoCard} onPress={() => useTemplate(p)}>
                    <Image source={{ uri: p.image }} style={st.inspoImg} contentFit="cover" />
                  </Pressable>
                ) : null,
              )}
            </ScrollView>
            <Text style={st.hint}>בוחרים עיצוב ← לוחצים "עיצוב מחדש ✨" לקבלת גרסה ייחודית משלכם</Text>
          </>
        )}

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

      {/* תצוגה מוגדלת */}
      <Modal visible={zoomOpen} transparent animationType="fade" onRequestClose={() => setZoomOpen(false)}>
        <Pressable style={st.zoomBackdrop} onPress={() => setZoomOpen(false)}>
          <View style={[st.zoomShirt, { backgroundColor: shirt.hex }]}>
            <View style={{ transform: [{ scale: 1.45 }] }}>
              <View style={[st.printArea, { borderColor: 'transparent' }]}>
                {localImg && <Image source={{ uri: localImg }} style={st.printImg} contentFit="contain" />}
                {layers.map((l) => (
                  <View
                    key={l.id}
                    style={[
                      st.layerWrap,
                      l.width != null && { width: l.width },
                      {
                        left: l.x,
                        top: l.y,
                        transform: [
                          { translateX: '-50%' as never },
                          { translateY: '-50%' as never },
                          { rotate: `${l.rotation}deg` },
                        ],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        {
                          fontFamily: l.font.family,
                          color: l.color,
                          fontSize: l.size,
                          textAlign: l.align,
                          letterSpacing: l.spacing,
                          fontWeight: l.bold ? '700' : 'normal',
                        },
                        l.highlight != null && {
                          backgroundColor: l.highlight,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 3,
                        },
                        l.outline && {
                          textShadowColor: l.color === '#000000' ? '#ffffff' : '#000000',
                          textShadowRadius: 3,
                          textShadowOffset: { width: 0, height: 0 },
                        },
                      ]}
                      numberOfLines={l.width != null ? undefined : 3}
                    >
                      {l.text}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <Text style={st.zoomHint}>הקישו בכל מקום לסגירה</Text>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.md, paddingBottom: S.xl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'right' },
  historyRow: { flexDirection: 'row', gap: S.xs },
  histBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  histBtnOff: { opacity: 0.35 },
  arrowBtn: {
    width: 44,
    height: 44,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { color: C.text, fontSize: 22, fontWeight: '800' },
  navArrowText: { color: C.accent, fontSize: 20, fontWeight: '800' },
  histText: { color: C.text, fontSize: 13, fontWeight: '700' },
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
  layerSelected: { borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed', borderRadius: 4 },
  dragHint: { color: C.textDim, fontSize: 12, textAlign: 'center', marginTop: 6 },
  zoomBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 38,
    height: 38,
    borderRadius: R.full,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: { fontSize: 17 },
  removeImgBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 38,
    height: 38,
    borderRadius: R.full,
    backgroundColor: '#000000aa',
    borderWidth: 1.5,
    borderColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImgText: { color: C.danger, fontSize: 18, fontWeight: '800' },
  resizeHandleHit: {
    position: 'absolute',
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleCorner: {
    width: 11,
    height: 11,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  handleBarH: {
    width: 18,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  handleBarV: {
    width: 8,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: '#000000ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomShirt: {
    width: '92%',
    height: '72%',
    borderRadius: R.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  zoomHint: { color: C.textDim, fontSize: 13, marginTop: S.md },
  symbolBtn: {
    width: 48,
    height: 48,
    borderRadius: R.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: { fontSize: 24 },
  inspoCard: {
    width: 84,
    height: 84,
    borderRadius: R.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  inspoImg: { width: '100%', height: '100%' },
  customBox: {
    marginTop: S.sm,
    backgroundColor: C.bg,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.sm,
  },
  customHeader: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: S.sm },
  customSwatch: { width: 40, height: 40, borderRadius: R.full, borderWidth: 2, borderColor: C.border },
  applyBtn: { backgroundColor: C.accent, borderRadius: R.full, paddingVertical: 9, paddingHorizontal: 18 },
  applyText: { color: C.onAccent, fontSize: 14, fontWeight: '800' },
  uploadOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
  },
  uploadText: { color: C.text, fontSize: 15, fontWeight: '600' },
  okText: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  rowSpread: { flexDirection: 'row', justifyContent: 'flex-end', gap: S.sm, marginTop: S.md },
  addTextBtn: { backgroundColor: C.accent, borderRadius: R.full, paddingVertical: 11, paddingHorizontal: 20 },
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
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
  },
  alignGroup: { flexDirection: 'row', gap: S.xs },
  alignBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  boldBtn: {
    width: 42,
    height: 38,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boldText: { color: C.textDim, fontSize: 17, fontWeight: '900' },
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
  swatchSm: {
    width: 34,
    height: 34,
    borderRadius: R.full,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderColor: C.accent, borderWidth: 3 },
  noneSwatch: { backgroundColor: C.bg },
  noneText: { color: C.textDim, fontSize: 14, fontWeight: '800' },
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
