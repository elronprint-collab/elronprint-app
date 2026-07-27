import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Image as RNImage,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
];

const SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];

const FONTS = [
  { name: 'היבו', family: 'Heebo' },
  { name: 'אסיסטנט', family: 'Assistant' },
  { name: 'רוביק', family: 'Rubik' },
  { name: 'סקולר וואן', family: 'SecularOne' },
  { name: 'אלף', family: 'Alef' },
  { name: 'ורלה ראונד', family: 'VarelaRound' },
  { name: 'פרנק ריהל ליברה', family: 'FrankRuhl' },
  { name: 'דוד ליברה', family: 'DavidLibre' },
  { name: 'נוטו סאנס עברית', family: 'NotoHebrew' },
  { name: 'מרים ליברה', family: 'MiriamLibre' },
  { name: 'קרנטינה', family: 'Karantina' },
  { name: 'סואץ וואן', family: 'SuezOne' },
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

// מרחק גס בין שני צבעים (0-441) — לבדיקת ניגודיות בסיסית בין טקסט לחולצה
function colorDistance(hexA: string, hexB: string): number {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

const TEXT_COLORS = [
  '#ffffff', '#000000', '#00fc25', '#ffd400', '#ff3b6b',
  '#37a7ff', '#ff7a00', '#a259ff', '#00d1c1', '#c0c0c0',
];

// רשת צבעים רחבה (בסגנון קנבה) לפאנל "צבע טקסט" — שורת גווני אפור + 3 שורות גוונים
const PALETTE_GRAY = ['#ffffff', '#d9d9d9', '#b4b4b4', '#808080', '#4d4d4d', '#262626', '#000000'];
// שורות גוונים מלאות — צבע קבוע לכל שורה, 7 גוני בהירות (בהיר→כהה) בכל אחת, כמו הרשת המלאה של קנבה
function buildHueRow(hue: number, sat = 80): string[] {
  return [92, 76, 60, 46, 32, 18, 6].map((l) => hslToHex(hue, sat, l));
}
const PALETTE_HUES = [225, 255, 270, 288, 325, 355, 3, 25, 45, 80, 105, 140, 155, 175, 190, 205, 215];
const PALETTE_GRID: string[][] = [PALETTE_GRAY, ...PALETTE_HUES.map((h) => buildHueRow(h))];

const HIGHLIGHTS: (string | null)[] = [null, '#000000', '#ffffff', '#00fc25', '#ffd400', '#ff3b6b'];

type ReadyDesign = { slug: string; label: string; source: number | string };

const READY_DESIGNS: ReadyDesign[] = [
  { slug: 'detective', label: 'בלש', source: require('../../assets/designs/detective.jpg') },
  { slug: 'scientist', label: 'מדענית', source: require('../../assets/designs/scientist.jpg') },
  { slug: 'sundress', label: 'שמלת קיץ', source: require('../../assets/designs/sundress.jpg') },
  { slug: 'sporty', label: 'ספורטיבי', source: require('../../assets/designs/sporty.jpg') },
  { slug: 'cozy', label: 'נעים', source: require('../../assets/designs/cozy.jpg') },
  { slug: 'futuristic', label: 'עתידני', source: require('../../assets/designs/futuristic.jpg') },
  { slug: 'rocker', label: 'רוקרית', source: require('../../assets/designs/rocker.jpg') },
  { slug: 'mystic', label: 'מיסטית', source: require('../../assets/designs/mystic.jpg') },
  { slug: 'reader', label: 'קוראת', source: require('../../assets/designs/reader.jpg') },
  { slug: 'traveler', label: 'מטיילת', source: require('../../assets/designs/traveler.jpg') },
  { slug: 'equestrian', label: 'רוכבת סוסים', source: require('../../assets/designs/equestrian.jpg') },
  { slug: 'dancer', label: 'רקדנית', source: require('../../assets/designs/dancer.jpg') },
  { slug: 'yoga', label: 'יוגה', source: require('../../assets/designs/yoga.jpg') },
  { slug: 'librarian', label: 'ספרנית', source: require('../../assets/designs/librarian.jpg') },
  { slug: 'pilot', label: 'טייסת', source: require('../../assets/designs/pilot.jpg') },
  { slug: 'gardener', label: 'גננת', source: require('../../assets/designs/gardener.jpg') },
  { slug: 'evening', label: 'ערב', source: require('../../assets/designs/evening.jpg') },
  { slug: 'chef', label: 'שפית', source: require('../../assets/designs/chef.jpg') },
  { slug: 'winter', label: 'חורף', source: require('../../assets/designs/winter.jpg') },
  { slug: 'artist', label: 'אמנית', source: require('../../assets/designs/artist.jpg') },
];

// require('./x.jpg') מחזיר צורות שונות בדפדפן לעומת נייטיב — מחרוזת ישירה ב-web,
// ולעיתים אובייקט עם uri, ורק בנייטיב יש resolveAssetSource אמיתי.
function resolveDesignUri(source: number | string): string | null {
  if (typeof source === 'string') return source;
  const asAny = source as any;
  if (asAny && typeof asAny === 'object' && typeof asAny.uri === 'string') return asAny.uri;
  if (typeof RNImage.resolveAssetSource === 'function') {
    const resolved = RNImage.resolveAssetSource(source as any);
    if (resolved?.uri) return resolved.uri;
  }
  return null;
}

// עיצובים מוכנים — סטריפ ה"עיצובים מוכנים" מעל אזור ההעלאה (מחליף את הרשימה שהגיעה
// בעבר מ-Shopify best-sellers). בחירה טוענת את העיצוב כתמונה, בדיוק כמו READY_DESIGNS.
const STARTER_DESIGNS: ReadyDesign[] = [
  { slug: 'forest-lord', label: 'Forest Lord', source: require('../../assets/designs/forest-lord.png') },
  { slug: 'cold-blood', label: 'Cold Blood', source: require('../../assets/designs/cold-blood.png') },
  { slug: 'savanna-king', label: 'Savanna King', source: require('../../assets/designs/savanna-king.png') },
  { slug: 'desert-peak', label: 'Desert Peak', source: require('../../assets/designs/desert-peak.png') },
  { slug: 'snow-hunter', label: 'Snow Hunter', source: require('../../assets/designs/snow-hunter.png') },
  { slug: 'wild-spirit', label: 'Wild Spirit', source: require('../../assets/designs/wild-spirit.png') },
  { slug: 'deep-ocean', label: 'Deep Ocean', source: require('../../assets/designs/deep-ocean.png') },
  { slug: 'urban-beast', label: 'Urban Beast', source: require('../../assets/designs/urban-beast.png') },
  { slug: 'night-stalker', label: 'Night Stalker', source: require('../../assets/designs/night-stalker.png') },
  { slug: 'eye-of-power', label: 'Eye of Power', source: require('../../assets/designs/eye-of-power.png') },
];

const ALIGNS = [
  { key: 'right', label: 'ימין' },
  { key: 'center', label: 'מרכז' },
  { key: 'left', label: 'שמאל' },
] as const;

// תיקון RTL: הסליידר מתהפך בממשק עברי, אז הופכים אותו חזרה
const SLIDER_INVERTED = Platform.OS === 'web' ? true : I18nManager.isRTL;

let AREA_W = 230;
let AREA_H = 276; // יחס 5:6 (4500×5400) — יעודכן בפועל לפי רוחב המסך הזמין

// דגל גלובלי: פעיל כל עוד גוררים ידית שינוי-גודל (של טקסט או תמונה).
// הבאג: ב-web, ה-PanResponder של השכבה עצמה "חוטף" את הגרירה מהידית (המקוננת בתוכה) ומזיז
// את כל המסגרת במקום להימתח — e.stopPropagation() בתוך onMouseDown של הידית לא מספיק כי
// מנגנון ה-Responder של react-native-web פותר מי "זוכה" בגרירה בנפרד מבועות (bubbling) הרגילות
// של React. הפתרון: הידית מדליקה את הדגל הזה לפני הגרירה, וה-PanResponder של השכבה בודק אותו
// ומתעלם מהתזוזה כל עוד הוא דלוק.
const RESIZING = { active: false };

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
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: 'right' | 'center' | 'left';
  highlight: string | null;
  spacing: number;
  width?: number; // רוחב מפורש של תיבת הטקסט — נקבע כשגוררים ידית צד/פינה
  height?: number; // גובה מפורש של תיבת הטקסט — כשמוגדר, הטקסט ממורכז אנכית בתוכו
  locked: boolean;
  opacity: number; // 0-100
  shadow: boolean;
  lineHeight: number; // מכפיל (1.0-2.0) על גודל הפונט
  flipH: boolean;
  flipV: boolean;
};

type HandleKind = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';

type ImgTransform = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  opacity: number;
  locked: boolean;
  borderStyle: BorderStyle;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number; // 0-100 (px)
  cropScale: number; // 1 = fit to frame, >1 = zoomed in for cropping
  cropOffsetX: number; // px offset of the image inside the crop frame
  cropOffsetY: number;
};

const DEFAULT_IMG: ImgTransform = {
  x: AREA_W / 2,
  y: AREA_H / 2,
  w: 150,
  h: 150,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 100,
  locked: false,
  borderStyle: 'none',
  borderColor: '#ffffff',
  borderWidth: 0,
  cornerRadius: 0,
  cropScale: 1,
  cropOffsetX: 0,
  cropOffsetY: 0,
};

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
let MAX_BOX_WIDTH = AREA_W;

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
    case 'e': {
      const width = clamp(Math.round(base.width + dx), MIN_BOX_WIDTH, MAX_BOX_WIDTH);
      // המיקום גם הוא מוגבל לפי הרוחב החדש (אחרי הקיפוא) — אותו תיקון שכבר בוצע לתמונה
      const x = clamp(Math.round(base.x + dx / 2), width / 2, AREA_W - width / 2);
      return { width, x };
    }
    case 'w': {
      const width = clamp(Math.round(base.width - dx), MIN_BOX_WIDTH, MAX_BOX_WIDTH);
      const x = clamp(Math.round(base.x + dx / 2), width / 2, AREA_W - width / 2);
      return { width, x };
    }
    case 's':
      return { size: clamp(Math.round(base.size + dy * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE) };
    case 'n':
      return { size: clamp(Math.round(base.size - dy * 0.7), MIN_TEXT_SIZE, MAX_TEXT_SIZE) };
  }
}

const MIN_IMG_SIZE = 30;
let MAX_IMG_SIZE = AREA_W - 6;
// תקרה נפרדת לגובה (מבוססת על AREA_H, לא AREA_W) — הקנבס גבוה יותר מרחב (יחס 5:6),
// אז תקרה משותפת אחת הייתה מגבילה את הגובה נמוך בהרבה מהגובה האמיתי של אזור ההדפסה,
// ומונעת מהתמונה לחזור למלא את כל הגובה אחרי שהוקטנה
let MAX_IMG_SIZE_H = AREA_H - 6;

// מחשב שינוי רוחב/גובה/מיקום לתמונה לפי כיוון הידית — פינות שומרות על יחס הממדים
function computeImageResizePatch(
  kind: HandleKind,
  dx: number,
  dy: number,
  base: { w: number; h: number; x: number; y: number },
): Partial<ImgTransform> {
  const aspect = base.w / base.h;
  switch (kind) {
    case 'se': {
      const diag = (dx + dy) / 2;
      const w = clamp(Math.round(base.w + diag), MIN_IMG_SIZE, MAX_IMG_SIZE);
      return { w, h: Math.round(w / aspect) };
    }
    case 'sw': {
      const diag = (-dx + dy) / 2;
      const w = clamp(Math.round(base.w + diag), MIN_IMG_SIZE, MAX_IMG_SIZE);
      return { w, h: Math.round(w / aspect) };
    }
    case 'ne': {
      const diag = (dx - dy) / 2;
      const w = clamp(Math.round(base.w + diag), MIN_IMG_SIZE, MAX_IMG_SIZE);
      return { w, h: Math.round(w / aspect) };
    }
    case 'nw': {
      const diag = (-dx - dy) / 2;
      const w = clamp(Math.round(base.w + diag), MIN_IMG_SIZE, MAX_IMG_SIZE);
      return { w, h: Math.round(w / aspect) };
    }
    case 'e': {
      const w = clamp(Math.round(base.w + dx), MIN_IMG_SIZE, MAX_IMG_SIZE);
      // המיקום גם הוא מוגבל לפי הרוחב החדש (אחרי הקיפוא) — כדי שגרירה מעבר לנקודת
      // ההקיפוא לא תמשיך לדחוף את התיבה אל מחוץ לקנבס בצד
      const x = clamp(Math.round(base.x + dx / 2), w / 2, AREA_W - w / 2);
      return { w, x };
    }
    case 'w': {
      const w = clamp(Math.round(base.w - dx), MIN_IMG_SIZE, MAX_IMG_SIZE);
      const x = clamp(Math.round(base.x + dx / 2), w / 2, AREA_W - w / 2);
      return { w, x };
    }
    case 's': {
      const h = clamp(Math.round(base.h + dy), MIN_IMG_SIZE, MAX_IMG_SIZE_H);
      const y = clamp(Math.round(base.y + dy / 2), h / 2, AREA_H - h / 2);
      return { h, y };
    }
    case 'n': {
      const h = clamp(Math.round(base.h - dy), MIN_IMG_SIZE, MAX_IMG_SIZE_H);
      const y = clamp(Math.round(base.y + dy / 2), h / 2, AREA_H - h / 2);
      return { h, y };
    }
  }
}

function useImageHandleResponder(
  kind: HandleKind,
  imgRef: MutableRefObject<ImgTransform>,
  onResize: (patch: Partial<ImgTransform>) => void,
  onDragStart: () => void,
  onDragEnd: () => void,
) {
  const base = useRef({ w: 0, h: 0, x: 0, y: 0 });
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !imgRef.current.locked,
      onStartShouldSetPanResponderCapture: () => !imgRef.current.locked,
      onMoveShouldSetPanResponder: () => !imgRef.current.locked,
      onMoveShouldSetPanResponderCapture: () => !imgRef.current.locked,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        base.current = { w: imgRef.current.w, h: imgRef.current.h, x: imgRef.current.x, y: imgRef.current.y };
        onDragStart();
      },
      onPanResponderMove: (_e, g) => {
        onResize(computeImageResizePatch(kind, g.dx, g.dy, base.current));
      },
      onPanResponderRelease: onDragEnd,
      onPanResponderTerminate: onDragEnd,
    }),
  ).current;
}

function webImageHandleHandlers(
  kind: HandleKind,
  imgRef: MutableRefObject<ImgTransform>,
  onResize: (patch: Partial<ImgTransform>) => void,
  onDragStart: () => void,
  onDragEnd: () => void,
) {
  return {
    onMouseDown: (e: any) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      RESIZING.active = true;
      const base = { w: imgRef.current.w, h: imgRef.current.h, x: imgRef.current.x, y: imgRef.current.y };
      const startX = e.clientX;
      const startY = e.clientY;
      onDragStart();
      const onMove = (ev: MouseEvent) => {
        onResize(computeImageResizePatch(kind, ev.clientX - startX, ev.clientY - startY, base));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        RESIZING.active = false;
        onDragEnd();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
  };
}

function DraggableImage({
  uri,
  img,
  selected,
  onSelect,
  onMove,
  onResize,
  onDragStart,
  onDragEnd,
}: {
  uri: string;
  img: ImgTransform;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (patch: Partial<ImgTransform>) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const start = useRef({ x: img.x, y: img.y });
  const imgRef = useRef(img);
  imgRef.current = img;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !imgRef.current.locked && !RESIZING.active,
      onMoveShouldSetPanResponder: (_e, g) =>
        !imgRef.current.locked && !RESIZING.active && Math.abs(g.dx) + Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        start.current = { x: imgRef.current.x, y: imgRef.current.y };
        onDragStart();
        onSelect();
      },
      onPanResponderMove: (_e, g) => {
        if (RESIZING.active) return; // ידית שינוי-גודל פעילה — לא להזיז את המסגרת
        // הגבלת התזוזה לפי הגודל האמיתי של התמונה (לא מרווח קבוע) — כדי שתמונה שממלאת
        // את כל הקנבס (ברירת המחדל החדשה) לא תיגרר אל מחוץ לאזור ההדפסה
        const halfW = imgRef.current.w / 2;
        const halfH = imgRef.current.h / 2;
        const nx = clamp(start.current.x + g.dx, halfW, AREA_W - halfW);
        const ny = clamp(start.current.y + g.dy, halfH, AREA_H - halfH);
        onMove(nx, ny);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: onDragEnd,
      onPanResponderTerminate: onDragEnd,
    }),
  ).current;

  const panNW = useImageHandleResponder('nw', imgRef, onResize, onDragStart, onDragEnd);
  const panN = useImageHandleResponder('n', imgRef, onResize, onDragStart, onDragEnd);
  const panNE = useImageHandleResponder('ne', imgRef, onResize, onDragStart, onDragEnd);
  const panW = useImageHandleResponder('w', imgRef, onResize, onDragStart, onDragEnd);
  const panE = useImageHandleResponder('e', imgRef, onResize, onDragStart, onDragEnd);
  const panSW = useImageHandleResponder('sw', imgRef, onResize, onDragStart, onDragEnd);
  const panS = useImageHandleResponder('s', imgRef, onResize, onDragStart, onDragEnd);
  const panSE = useImageHandleResponder('se', imgRef, onResize, onDragStart, onDragEnd);
  const handlePanByKind: Record<HandleKind, ReturnType<typeof useImageHandleResponder>> = {
    nw: panNW,
    n: panN,
    ne: panNE,
    w: panW,
    e: panE,
    sw: panSW,
    s: panS,
    se: panSE,
  };

  start.current = selected ? start.current : { x: img.x, y: img.y };

  return (
    <View
      {...pan.panHandlers}
      style={{
        position: 'absolute',
        left: img.x - img.w / 2,
        top: img.y - img.h / 2,
        width: img.w,
        height: img.h,
        opacity: img.opacity / 100,
        borderRadius: img.cornerRadius,
        overflow: 'hidden',
        borderWidth: img.borderStyle === 'none' ? 0 : img.borderWidth,
        borderColor: img.borderColor,
        borderStyle: img.borderStyle === 'none' ? 'solid' : img.borderStyle,
        transform: [
          { rotate: `${img.rotation}deg` },
          { scaleX: img.flipH ? -1 : 1 },
          { scaleY: img.flipV ? -1 : 1 },
        ],
      }}
    >
      <Image
        source={{ uri }}
        style={[
          st.printImg,
          {
            // מידות מפורשות בפיקסלים (לא אחוזים) — יחסית לתיבה עצמה (img.w/img.h), שכבר
            // שווה בדיוק לאזור ההדפסה. אחוזים (100%) לא תמיד נפתרים נכון לגובה בכל הפלטפורמות/ה-web,
            // וזה גרם למילוי לרוחב לעבוד אבל לא לגובה.
            width: img.w * img.cropScale,
            height: img.h * img.cropScale,
            left: img.cropOffsetX,
            top: img.cropOffsetY,
          },
          // בדפדפן, גרירת עכבר על תג <img> מפעילה את "גרירת התמונה הטבעית" של הדפדפן (הצללית
          // האפורה) — זה חוטף את המשיכה ומונע מהמסגרת לזוז. draggable=false + הכיבוי הבא מונעים את זה.
          Platform.OS === 'web' ? ({ userSelect: 'none', WebkitUserDrag: 'none' } as any) : null,
        ]}
        contentFit="fill"
        {...(Platform.OS === 'web' ? ({ draggable: false } as any) : null)}
      />
      {selected && <View style={st.imgSelectedBorder} pointerEvents="none" />}
      {img.locked && selected && (
        <View style={st.lockBadge}>
          <Text style={st.lockBadgeText}>🔒</Text>
        </View>
      )}
      {selected &&
        !img.locked &&
        HANDLES.map(({ kind, leftPct, topPct }) => {
          const isCorner = kind.length === 2;
          const isVerticalBar = kind === 'w' || kind === 'e';
          const shape = isCorner ? st.handleCorner : isVerticalBar ? st.handleBarV : st.handleBarH;
          const HIT = 34;
          return (
            <View
              key={kind}
              {...(Platform.OS === 'web'
                ? webImageHandleHandlers(kind, imgRef, onResize, onDragStart, onDragEnd)
                : handlePanByKind[kind].panHandlers)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[
                st.resizeHandleHit,
                {
                  left: (leftPct / 100) * img.w - HIT / 2,
                  top: (topPct / 100) * img.h - HIT / 2,
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

let nextId = 1;
const DRAFT_KEY = 'epd-studio-draft-v1';
const DEFAULT_LAYER_TEXT = 'הטקסט שלי';

function newLayer(): Layer {
  return {
    id: nextId++,
    text: DEFAULT_LAYER_TEXT,
    font: FONTS[0],
    color: '#ffffff',
    size: 26,
    width: MAX_BOX_WIDTH,
    height: AREA_H,
    x: AREA_W / 2,
    y: AREA_H / 2,
    rotation: 0,
    outline: false,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    align: 'center',
    highlight: null,
    spacing: 0,
    locked: false,
    opacity: 100,
    shadow: false,
    lineHeight: 1.2,
    flipH: false,
    flipV: false,
  };
}

// גרירת עכבר להזזת כל התיבה (לא שינוי גודל) — נדרש רק בדפדפן מחשב, באותו דפוס בדיוק
// כמו הידיות עצמן. במקום להישען על PanResponder (מנגנון המגע של רקטיב-נייטיב) עבור
// ההזזה, זה עוקף אותו לגמרי ב-web — בדיוק כמו שכבר עשינו לידיות עצמן.
function webLayerMoveHandlers(
  layerRef: MutableRefObject<Layer>,
  measuredRef: MutableRefObject<{ w: number; h: number }>,
  onMove: (x: number, y: number) => void,
  onSelect: () => void,
  onDragStart: () => void,
  onDragEnd: () => void,
) {
  return {
    onMouseDown: (e: any) => {
      if (layerRef.current.locked || RESIZING.active) return;
      onSelect();
      const startX = e.clientX;
      const startY = e.clientY;
      const base = { x: layerRef.current.x, y: layerRef.current.y };
      let started = false;
      const onMoveEv = (ev: MouseEvent) => {
        if (RESIZING.active) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!started) {
          if (Math.abs(dx) + Math.abs(dy) <= 2) return;
          started = true;
          onDragStart();
        }
        const halfW = (layerRef.current.width ?? measuredRef.current.w) / 2;
        const halfH = (layerRef.current.height ?? measuredRef.current.h) / 2;
        const nx = clamp(base.x + dx, halfW, AREA_W - halfW);
        const ny = clamp(base.y + dy, halfH, AREA_H - halfH);
        onMove(nx, ny);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMoveEv);
        window.removeEventListener('mouseup', onUp);
        if (started) onDragEnd();
      };
      window.addEventListener('mousemove', onMoveEv);
      window.addEventListener('mouseup', onUp);
    },
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
      RESIZING.active = true;
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
        RESIZING.active = false;
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
  onMeasured,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (patch: Partial<Layer>) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMeasured?: (w: number, h: number) => void;
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
      onStartShouldSetPanResponder: () => !layerRef.current.locked && !RESIZING.active,
      onMoveShouldSetPanResponder: (_e, g) =>
        !layerRef.current.locked && !RESIZING.active && Math.abs(g.dx) + Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        start.current = { x: layerRef.current.x, y: layerRef.current.y };
        onDragStart();
        onSelect();
      },
      onPanResponderMove: (_e, g) => {
        if (RESIZING.active) return; // ידית שינוי-גודל פעילה — לא להזיז את המסגרת
        // הגבלת התזוזה לפי הגודל האמיתי של התיבה (לא מרווח קבוע) — אותו תיקון שכבר
        // בוצע לתמונה, כדי שתיבת טקסט שממלאת את כל הקנבס לא תיגרר אל מחוץ לאזור ההדפסה
        const halfW = (layerRef.current.width ?? measuredRef.current.w) / 2;
        const halfH = (layerRef.current.height ?? measuredRef.current.h) / 2;
        const nx = clamp(start.current.x + g.dx, halfW, AREA_W - halfW);
        const ny = clamp(start.current.y + g.dy, halfH, AREA_H - halfH);
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

  const textShadow = layer.outline
    ? {
        textShadowColor: layer.color === '#000000' ? '#ffffff' : '#000000',
        textShadowRadius: 3,
        textShadowOffset: { width: 0, height: 0 },
      }
    : layer.shadow
      ? { textShadowColor: '#00000099', textShadowRadius: 4, textShadowOffset: { width: 2, height: 3 } }
      : layer.bold
        ? { textShadowColor: layer.color, textShadowRadius: 0.8, textShadowOffset: { width: 0, height: 0 } }
        : null;

  const canEditHandles = selected && !layer.locked;

  return (
    <View
      {...(Platform.OS === 'web'
        ? webLayerMoveHandlers(layerRef, measuredRef, onMove, onSelect, onDragStart, onDragEnd)
        : pan.panHandlers)}
      onLayout={(e) => {
        const next = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        measuredRef.current = next;
        setMeasured(next);
        onMeasured?.(next.w, next.h);
      }}
      style={[
        st.layerWrap,
        layer.width != null && { width: layer.width },
        layer.height != null && { height: layer.height },
        {
          // מיקום בפיקסלים ישירים (במקום transform:translate אחוזי) — אותה גישה שכבר
          // מוכחת כעובדת נכון בתמונה; ה-transform האחוזי נחשד כמקור לבעיית הלחיצה על
          // ידיות שינוי-הגודל שבקצוות האנכיים (למעלה/למטה), בזמן שהתמונה (שלא משתמשת
          // ב-transform אחוזי) מעולם לא סבלה מהבעיה הזו.
          left: layer.x - (layer.width ?? measured.w) / 2,
          top: layer.y - (layer.height ?? measured.h) / 2,
          opacity: layer.opacity / 100,
          transform: [
            { rotate: `${layer.rotation}deg` },
            { scaleX: layer.flipH ? -1 : 1 },
            { scaleY: layer.flipV ? -1 : 1 },
          ],
        },
        selected && st.layerSelected,
        Platform.OS === 'web' ? ({ touchAction: 'none' } as any) : null,
      ]}
    >
      {/*
        עטיפה פנימית נפרדת רק לטקסט, עם justifyContent:'center' למירכוז אנכי בתוך
        התיבה. ה-justifyContent הזה על התיבה החיצונית (שגם הידיות הן ילדים ישירים
        שלה) נחשד כגורם ל-Yoga (מנוע הפריסה) להתערב במיקום ה-position:'absolute'
        של הידיות בקצוות האנכיים — בדיוק ההבדל המבני מול התמונה, שהעטיפה שלה
        לעולם לא השתמשה ב-justifyContent/alignItems ומעולם לא סבלה מהבעיה הזו.
      */}
      <View style={layer.height != null ? st.textInner : undefined}>
        <Text
          style={[
            {
              fontFamily: layer.font.family,
              color: layer.color,
              fontSize: layer.size,
              lineHeight: Math.round(layer.size * layer.lineHeight),
              textAlign: layer.align,
              letterSpacing: layer.spacing,
              fontWeight: layer.bold ? '700' : 'normal',
              fontStyle: layer.italic ? 'italic' : 'normal',
              textDecorationLine:
                layer.underline && layer.strikethrough
                  ? 'underline line-through'
                  : layer.underline
                    ? 'underline'
                    : layer.strikethrough
                      ? 'line-through'
                      : 'none',
            },
            layer.highlight != null && {
              backgroundColor: layer.highlight,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 3,
            },
            textShadow,
          ]}
          numberOfLines={layer.width != null ? undefined : 3}
        >
          {layer.text}
        </Text>
      </View>
      {layer.locked && selected && (
        <View style={st.lockBadge}>
          <Text style={st.lockBadgeText}>🔒</Text>
        </View>
      )}
      {canEditHandles &&
        HANDLES.map(({ kind, leftPct, topPct }) => {
          const isCorner = kind.length === 2;
          const isVerticalBar = kind === 'w' || kind === 'e';
          const shape = isCorner ? st.handleCorner : isVerticalBar ? st.handleBarV : st.handleBarH;
          // בלי transform למרכוז — ב-RN באנדרואיד אזור המגע לא תמיד עוקב אחרי transform,
          // אז ממקמים בחישוב ישיר (הפינה השמאלית-עליונה של אזור המגע) כדי שהמגע יתאים בדיוק למה שרואים
          const HIT = 44;
          return (
            <View
              key={kind}
              {...(Platform.OS === 'web'
                ? webHandleHandlers(kind, layerRef, measuredRef, onResize, onDragStart, onDragEnd)
                : handlePanByKind[kind].panHandlers)}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              style={[
                st.resizeHandleHit,
                {
                  width: HIT,
                  height: HIT,
                  zIndex: 999,
                  elevation: 999,
                  left: (leftPct / 100) * (layer.width ?? measured.w) - HIT / 2,
                  top: (topPct / 100) * (layer.height ?? measured.h) - HIT / 2,
                },
                // מונע מהדפדפן לפרש גרירה בטאצ'פד/מגע על הידית כמחוות גלילה/החלקה של הדף —
                // בלעדיו, גרירה אנכית עלולה "להתחרות" עם גלילת הדף במקום להזיז/לשנות גודל
                Platform.OS === 'web' ? ({ touchAction: 'none' } as any) : null,
              ]}
            >
              <View style={shape} />
            </View>
          );
        })}
    </View>
  );
}

// פאנל הקשר משותף — פאנל צד קבוע מימין בדסקטופ, גיליון תחתון (bottom sheet) בנייד.
// זה הבסיס למעבר ההדרגתי של פאנלי הכלים לפריסה הזו (מתחילים עם צבע טקסט).
function ContextPanel({
  visible,
  onClose,
  title,
  isDesktop,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  isDesktop: boolean;
  children: ReactNode;
}) {
  if (isDesktop) {
    if (!visible) return null;
    return (
      <View style={st.sidePanelDesktop}>
        <View style={st.sidePanelHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={st.sidePanelClose}>✕</Text>
          </Pressable>
          <Text style={st.sidePanelTitle}>{title}</Text>
        </View>
        <ScrollView contentContainerStyle={st.sidePanelBody}>{children}</ScrollView>
      </View>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.bottomSheetBackdrop} onPress={onClose} />
      <View style={st.bottomSheetPanel}>
        <View style={st.sidePanelHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={st.sidePanelClose}>✕</Text>
          </Pressable>
          <Text style={st.sidePanelTitle}>{title}</Text>
        </View>
        <ScrollView contentContainerStyle={st.sidePanelBody}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export default function Studio() {
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth >= 900;
  const [, bumpCanvas] = useState(0);
  const canvasAvailWidth = Math.min(
    isDesktop ? (winWidth - 64) * 0.75 - 24 : winWidth - 32,
    isDesktop ? 480 : 340,
  );
  useEffect(() => {
    const nextW = Math.max(180, Math.round(canvasAvailWidth));
    const nextH = Math.round((nextW * 6) / 5);
    if (Math.abs(nextW - AREA_W) > 1) {
      AREA_W = nextW;
      AREA_H = nextH;
      MAX_BOX_WIDTH = AREA_W;
      MAX_IMG_SIZE = AREA_W - 6;
      MAX_IMG_SIZE_H = AREA_H - 6;
      bumpCanvas((n) => n + 1);
    }
  }, [canvasAvailWidth]);

  const [shirt, setShirt] = useState(SHIRT_COLORS[0]);
  const [size, setSize] = useState('M');
  const [localImg, setLocalImg] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [img, setImg] = useState<ImgTransform>(DEFAULT_IMG);
  const [imageSelected, setImageSelected] = useState(false);
  const [naturalImgSize, setNaturalImgSize] = useState<{ w: number; h: number } | null>(null);
  const [hasTransparency, setHasTransparency] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [aiBusy, setAiBusy] = useState<null | 'bg' | 'up' | 'remix'>(null);

  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  // שמירה אוטומטית מקומית — טוענים טיוטה שמורה בכניסה לסטודיו (למקרה שיצאו בטעות), ושומרים
  // אותה מחדש בכל שינוי, כדי שהעיצוב לא ילך לאיבוד. נשמר רק על המכשיר, לא בענן.
  const draftLoaded = useRef(false);
  // דגל: האם המשתמש כבר העלה/החליף תמונה חדשה בסשן הנוכחי — אם כן, שחזור הטיוטה (למטה,
  // אסינכרוני ולפעמים איטי יותר מהעלאת תמונה) לא ידרוס אותה בערכים ישנים ששמורים מקודם.
  const freshImageActionRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.shirtHex) {
          const found = SHIRT_COLORS.find((c) => c.hex === d.shirtHex);
          setShirt(found ?? { name: 'מותאם', hex: d.shirtHex });
        }
        if (d.size) setSize(d.size);
        if (Array.isArray(d.layers) && d.layers.length) {
          setLayers(d.layers);
          const maxId = Math.max(0, ...d.layers.map((l: Layer) => l.id));
          nextId = Math.max(nextId, maxId + 1);
        }
        if (d.localImg && !freshImageActionRef.current) setLocalImg(d.localImg);
        if (!freshImageActionRef.current) {
          if (d.cloudUrl) setCloudUrl(d.cloudUrl);
          else if (d.localImg) {
            // התמונה נשמרה מקומית אבל ההעלאה לענן לא הושלמה (למשל אם היישום נסגר באמצע) —
            // מנסים להעלות שוב ברקע כדי שאפשר יהיה להמשיך להזמנה בלי לתקוע את המשתמש
            setUploading(true);
            uploadImage(d.localImg)
              .then((url) => setCloudUrl(url))
              .catch(() => {})
              .finally(() => setUploading(false));
          }
        }
        if (d.img && !freshImageActionRef.current) setImg({ ...DEFAULT_IMG, ...d.img });
      })
      .catch(() => {})
      .finally(() => {
        draftLoaded.current = true;
      });
  }, []);

  useEffect(() => {
    if (!draftLoaded.current) return;
    const t = setTimeout(() => {
      const hasContent = layers.some((l) => l.text.trim() && l.text.trim() !== DEFAULT_LAYER_TEXT) || !!localImg;
      if (!hasContent) {
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        return;
      }
      AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ shirtHex: shirt.hex, size, layers, localImg, cloudUrl, img }),
      ).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [shirt, size, layers, localImg, cloudUrl, img]);

  // ביטול / חזרה
  type Snap = { layers: Layer[]; localImg: string | null; cloudUrl: string | null; img: ImgTransform };
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const [, forceHistory] = useState(0);

  function currentSnap(): Snap {
    return { layers: layers.map((l) => ({ ...l })), localImg, cloudUrl, img: { ...img } };
  }

  function applySnap(sn: Snap) {
    setLayers(sn.layers);
    setLocalImg(sn.localImg);
    setCloudUrl(sn.cloudUrl);
    setImg(sn.img);
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
    freshImageActionRef.current = true;
    snapshot();
    setLocalImg(null);
    setCloudUrl(null);
    setImg(DEFAULT_IMG);
    setImageSelected(false);
    setNaturalImgSize(null);
    setHasTransparency(false);
  }

  // מתאים את תיבת התמונה למילוי מלוא אזור ההדפסה (התמונה "נמתחת" על כל הקנבס), וגם שומר
  // את הרזולוציה הטבעית שלה לצורך בדיקת איכות ההדפסה
  function fitImageBox(url: string) {
    freshImageActionRef.current = true;
    // מילוי הקנבס לא תלוי בגודל הטבעי של התמונה — קובעים את זה מיד, לפני שממתינים ל-getSize.
    // אם getSize נכשל בשקט (רשת/דחיסה/CORS וכו') התמונה עדיין תמלא את הקנבס נכון;
    // getSize למטה משמש רק למידע לצורך אזהרת האיכות, לא לגודל בפועל.
    setImg((prev) => ({ ...prev, w: AREA_W, h: AREA_H, x: AREA_W / 2, y: AREA_H / 2 }));
    RNImage.getSize(
      url,
      (w, h) => {
        setNaturalImgSize({ w, h });
      },
      () => {},
    );
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

  function updateImg(patch: Partial<ImgTransform>, withSnapshot = true) {
    if (withSnapshot) snapshot();
    setImg((prev) => ({ ...prev, ...patch }));
  }

  // סדר שכבות — הבאה לפנים / שליחה לאחור (בין הטקסטים/גרפיקות בינם לבין עצמם)
  function bringToFront() {
    if (selectedId == null) return;
    snapshot();
    setLayers((ls) => {
      const idx = ls.findIndex((l) => l.id === selectedId);
      if (idx < 0 || idx === ls.length - 1) return ls;
      const copy = [...ls];
      const [item] = copy.splice(idx, 1);
      copy.push(item);
      return copy;
    });
  }

  function sendToBack() {
    if (selectedId == null) return;
    snapshot();
    setLayers((ls) => {
      const idx = ls.findIndex((l) => l.id === selectedId);
      if (idx <= 0) return ls;
      const copy = [...ls];
      const [item] = copy.splice(idx, 1);
      copy.unshift(item);
      return copy;
    });
  }

  // מיקום התיבה של השכבה הנבחרת (נמדד בפועל דרך onLayout ב-DraggableText)
  const layerSizeRef = useRef<Record<number, { w: number; h: number }>>({});

  // יישור השכבה הנבחרת ביחס לאזור ההדפסה
  function alignLayer(kind: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') {
    if (selectedId == null) return;
    const dims = layerSizeRef.current[selectedId] ?? { w: 80, h: 30 };
    const margin = 10;
    let patch: Partial<Layer> = {};
    switch (kind) {
      case 'left':
        patch = { x: margin + dims.w / 2 };
        break;
      case 'centerX':
        patch = { x: AREA_W / 2 };
        break;
      case 'right':
        patch = { x: AREA_W - margin - dims.w / 2 };
        break;
      case 'top':
        patch = { y: margin + dims.h / 2 };
        break;
      case 'centerY':
        patch = { y: AREA_H / 2 };
        break;
      case 'bottom':
        patch = { y: AREA_H - margin - dims.h / 2 };
        break;
    }
    updateSelected(patch);
  }

  function centerLayerOnShirt() {
    if (selectedId == null) return;
    updateSelected({ x: AREA_W / 2, y: AREA_H / 2 });
  }

  function alignImage(kind: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') {
    const margin = 6;
    switch (kind) {
      case 'left':
        updateImg({ x: margin + img.w / 2 });
        break;
      case 'centerX':
        updateImg({ x: AREA_W / 2 });
        break;
      case 'right':
        updateImg({ x: AREA_W - margin - img.w / 2 });
        break;
      case 'top':
        updateImg({ y: margin + img.h / 2 });
        break;
      case 'centerY':
        updateImg({ y: AREA_H / 2 });
        break;
      case 'bottom':
        updateImg({ y: AREA_H - margin - img.h / 2 });
        break;
    }
  }

  const textEditSnapped = useRef(false);

  // השראה מהחנות + זום
  const [inspiration, setInspiration] = useState<Product[]>([]);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [openPanel, setOpenPanel] = useState<null | 'font' | 'color' | 'highlight' | 'more' | 'align'>(null);
  const fontScrollRef = useRef<ScrollView>(null);
  const fontScrollX = useRef(0);
  const [shirtPaletteOpen, setShirtPaletteOpen] = useState(false);
  const [imgPanel, setImgPanel] = useState<null | 'crop' | 'border'>(null);
  const BORDER_STYLES: { key: BorderStyle; label: string }[] = [
    { key: 'none', label: '⊘' },
    { key: 'dotted', label: '⋯' },
    { key: 'dashed', label: '- -' },
    { key: 'solid', label: '—' },
  ];
  const [readyDesignsOpen, setReadyDesignsOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (isConfigured()) {
      fetchProducts(12)
        .then(setInspiration)
        .catch(() => {});
    }
  }, []);

  async function useTemplate(p: Product) {
    if (!p.image || uploading) return;
    snapshot();
    setLocalImg(p.image);
    setUploading(true);
    setCloudUrl(null);
    setHasTransparency(false);
    try {
      const url = await uploadRemote(p.image);
      setCloudUrl(url);
      fitImageBox(url);
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
    setHasTransparency(false);
    fitImageBox(uri);
    try {
      const url = await uploadImage(uri);
      setCloudUrl(url);
    } catch {
      Alert.alert('שגיאה', 'העלאת התמונה נכשלה. בדקו חיבור לאינטרנט ונסו שוב.');
    } finally {
      setUploading(false);
    }
  }

  async function useReadyDesign(design: ReadyDesign) {
    const uri = resolveDesignUri(design.source);
    if (!uri) {
      Alert.alert('שגיאה', 'לא ניתן לטעון את העיצוב הזה, נסו שנית');
      return;
    }
    setReadyDesignsOpen(false);
    snapshot();
    setLocalImg(uri);
    setUploading(true);
    setCloudUrl(null);
    setHasTransparency(false);
    fitImageBox(uri);
    try {
      const url = await uploadImage(uri);
      setCloudUrl(url);
    } catch {
      Alert.alert('שגיאה', 'טעינת העיצוב נכשלה. בדקו חיבור לאינטרנט ונסו שוב.');
    } finally {
      setUploading(false);
    }
  }

  async function useStarterDesign(design: ReadyDesign) {
    const uri = resolveDesignUri(design.source);
    if (!uri) {
      Alert.alert('שגיאה', 'לא ניתן לטעון את העיצוב הזה, נסו שנית');
      return;
    }
    snapshot();
    setLocalImg(uri);
    setUploading(true);
    setCloudUrl(null);
    setHasTransparency(false);
    fitImageBox(uri);
    try {
      const url = await uploadImage(uri);
      setCloudUrl(url);
    } catch {
      Alert.alert('שגיאה', 'טעינת העיצוב נכשלה. בדקו חיבור לאינטרנט ונסו שוב.');
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
      fitImageBox(resultUrl);
      if (kind === 'bg') setHasTransparency(true);
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'הפעולה נכשלה, נסו שוב');
    } finally {
      setAiBusy(null);
    }
  }

  async function continueToOrder() {
    if (ordering || uploading) return;
    if (!hasDesign && localImg) {
      setUploading(true);
      try {
        const url = await uploadImage(localImg);
        setCloudUrl(url);
      } catch {
        Alert.alert('שגיאה', 'העלאת התמונה נכשלה. בדקו חיבור לאינטרנט ונסו שוב.');
        setUploading(false);
        return;
      }
      setUploading(false);
    } else if (!hasDesign) {
      return;
    }
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
            l.italic ? 'נטוי' : '',
            l.underline ? 'קו תחתון' : '',
            l.strikethrough ? 'קו חוצה' : '',
            l.align !== 'center' ? `יישור ${ALIGNS.find((a) => a.key === l.align)?.label}` : '',
            l.highlight ? `רקע ${l.highlight}` : '',
            l.spacing > 0 ? `ריווח ${l.spacing}` : '',
            l.outline ? 'מתאר' : '',
            l.shadow ? 'צל' : '',
            l.opacity !== 100 ? `שקיפות ${l.opacity}%` : '',
            l.lineHeight !== 1.2 ? `מרווח שורות ${l.lineHeight.toFixed(1)}` : '',
            l.flipH ? 'הפוך אופקית' : '',
            l.flipV ? 'הפוך אנכית' : '',
            l.locked ? 'נעול' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          attributes.push({ key: `טקסט ${i + 1}`, value: l.text.trim() }, { key: `טקסט ${i + 1} — עיצוב`, value: details });
        });
      if (cloudUrl) {
        const imgDetails = [
          `גודל ${img.w}×${img.h}px`,
          `מיקום ${Math.round((img.x / AREA_W) * 100)}%,${Math.round((img.y / AREA_H) * 100)}%`,
          img.rotation !== 0 ? `סיבוב ${img.rotation}°` : '',
          img.flipH ? 'הפוך אופקית' : '',
          img.flipV ? 'הפוך אנכית' : '',
          img.opacity !== 100 ? `שקיפות ${img.opacity}%` : '',
          img.cornerRadius > 0 ? `עיגול פינות ${img.cornerRadius}px` : '',
          img.borderStyle !== 'none' ? `מסגרת ${img.borderStyle} ${img.borderWidth}px ${img.borderColor}` : '',
          img.cropScale !== 1 ? `חיתוך זום ${Math.round(img.cropScale * 100)}%` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        attributes.push({ key: 'תמונה — מיקום ועיצוב', value: imgDetails });
      }

      cart.add({
        variantId: variant.id,
        title: 'חולצה בעיצוב אישי',
        subtitle: `${shirt.name} · ${size}`,
        image: cloudUrl,
        design: {
          shirtHex: shirt.hex,
          image: cloudUrl,
          imageTransform: cloudUrl
            ? {
                x: img.x,
                y: img.y,
                w: img.w,
                h: img.h,
                rotation: img.rotation,
                flipH: img.flipH,
                flipV: img.flipV,
                opacity: img.opacity,
                borderStyle: img.borderStyle,
                borderColor: img.borderColor,
                borderWidth: img.borderWidth,
                cornerRadius: img.cornerRadius,
                cropScale: img.cropScale,
                cropOffsetX: img.cropOffsetX,
                cropOffsetY: img.cropOffsetY,
              }
            : undefined,
          layers: layers
            .filter((l) => l.text.trim())
            .map((l) => ({
              text: l.text,
              fontFamily: l.font.family,
              color: l.color,
              size: l.size,
              width: l.width,
              height: l.height,
              x: l.x,
              y: l.y,
              rotation: l.rotation,
              align: l.align,
              spacing: l.spacing,
              bold: l.bold,
              italic: l.italic,
              underline: l.underline,
              strikethrough: l.strikethrough,
              highlight: l.highlight,
              outline: l.outline,
              opacity: l.opacity,
              shadow: l.shadow,
              lineHeight: l.lineHeight,
              flipH: l.flipH,
              flipV: l.flipV,
            })),
        },
        price: Number(variant.price),
        currency: variant.currency,
        quantity: 1,
        attributes,
      });
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      router.push('/cart');
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו להוסיף לעגלה, נסו שוב');
    } finally {
      setOrdering(false);
    }
  }

  const cart = useCart();
  const hasDesign = !!cloudUrl || layers.some((l) => l.text.trim());
  const lightShirt = colorDistance(shirt.hex, '#ffffff') < colorDistance(shirt.hex, '#000000');

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
      <ScrollView
        style={isDesktop ? { flex: 1 } : undefined}
        contentContainerStyle={st.scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!scrollLocked}
      >
        <View style={[st.rowSpread, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={st.title}>סטודיו לעיצוב</Text>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
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
        <View style={[st.shirtPreview, { height: AREA_H + 80 }]}>
          <View
            style={[
              st.printArea,
              { width: AREA_W, height: AREA_H, backgroundColor: shirt.hex, borderColor: lightShirt ? '#00000022' : '#ffffff22' },
            ]}
          >
            {localImg && (
              <DraggableImage
                uri={localImg}
                img={img}
                selected={imageSelected}
                onSelect={() => {
                  setImageSelected(true);
                  setSelectedId(null);
                }}
                onDragStart={() => {
                  snapshot();
                  setScrollLocked(true);
                }}
                onDragEnd={() => setScrollLocked(false)}
                onMove={(x, y) => setImg((prev) => ({ ...prev, x, y }))}
                onResize={(patch) => setImg((prev) => ({ ...prev, ...patch }))}
              />
            )}
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
                onSelect={() => {
                  setSelectedId(l.id);
                  setImageSelected(false);
                }}
                onDragStart={() => {
                  snapshot();
                  setScrollLocked(true);
                }}
                onDragEnd={() => setScrollLocked(false)}
                onMove={(x, y) => setLayers((ls) => ls.map((li) => (li.id === l.id ? { ...li, x, y } : li)))}
                onResize={(patch) => setLayers((ls) => ls.map((li) => (li.id === l.id ? { ...li, ...patch } : li)))}
                onMeasured={(w, h) => {
                  layerSizeRef.current[l.id] = { w, h };
                }}
              />
            ))}
            <Pressable style={st.zoomBtn} onPress={() => setZoomOpen(true)} hitSlop={8}>
              <Text style={st.zoomBtnText}>⛶</Text>
            </Pressable>
            {localImg && !uploading && (
              <Pressable style={st.removeImgBtn} onPress={removeImage} hitSlop={8}>
                <Text style={st.removeImgText}>✕</Text>
              </Pressable>
            )}
          </View>
          {uploading && (
            <View style={st.uploadOverlay}>
              <ActivityIndicator color={C.accent} size="large" />
              <Text style={st.uploadText}>מעלה את העיצוב…</Text>
            </View>
          )}
        </View>

        {/* סרגל כלים קטן לתמונה — מופיע כשהתמונה נבחרת */}
        {imageSelected && localImg && (
          <View style={st.toolbarWrap}>
            <View style={st.toolbarRow}>
              <Pressable
                style={[st.moreBtn, img.flipH && st.btnActive]}
                onPress={() => updateImg({ flipH: !img.flipH })}
              >
                <Text style={[st.moreBtnText, img.flipH && st.textActive]}>⇋ אופקי</Text>
              </Pressable>
              <Pressable
                style={[st.moreBtn, img.flipV && st.btnActive]}
                onPress={() => updateImg({ flipV: !img.flipV })}
              >
                <Text style={[st.moreBtnText, img.flipV && st.textActive]}>⇵ אנכי</Text>
              </Pressable>
              <Pressable
                style={[st.moreBtn, img.locked && st.btnActive]}
                onPress={() => updateImg({ locked: !img.locked })}
              >
                <Text style={[st.moreBtnText, img.locked && st.textActive]}>🔒 נעילה</Text>
              </Pressable>
              <View style={st.stepperGroup}>
                <Pressable style={st.stepBtn} onPress={() => updateImg({ rotation: clamp(img.rotation - 5, -45, 45) })}>
                  <Text style={st.stepBtnText}>−</Text>
                </Pressable>
                <Text style={st.stepValue}>{img.rotation}°</Text>
                <Pressable style={st.stepBtn} onPress={() => updateImg({ rotation: clamp(img.rotation + 5, -45, 45) })}>
                  <Text style={st.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={st.sliderRow}>
              <Text style={st.sliderValue}>{img.opacity}%</Text>
              <Slider
                style={st.slider}
                inverted={SLIDER_INVERTED}
                minimumValue={10}
                maximumValue={100}
                step={5}
                value={img.opacity}
                onSlidingStart={snapshot}
                onValueChange={(v) => updateImg({ opacity: Math.round(v) }, false)}
                minimumTrackTintColor={C.accent}
                maximumTrackTintColor={C.border}
                thumbTintColor={C.accent}
              />
              <Text style={st.sliderLabel}>שקיפות</Text>
            </View>
            <View style={st.stepperGroup}>
              <Pressable style={st.stepBtn} onPress={() => updateImg({ opacity: clamp(img.opacity - 5, 10, 100) })}>
                <Text style={st.stepBtnText}>−</Text>
              </Pressable>
              <Text style={st.stepValue}>{img.opacity}%</Text>
              <Pressable style={st.stepBtn} onPress={() => updateImg({ opacity: clamp(img.opacity + 5, 10, 100) })}>
                <Text style={st.stepBtnText}>+</Text>
              </Pressable>
            </View>

            <Text style={st.subLabel}>יישור התמונה</Text>
            <View style={st.row}>
              <Pressable style={st.alignQuickBtn} onPress={() => { updateImg({ x: AREA_W / 2, y: AREA_H / 2 }); }}>
                <Text style={st.alignQuickText}>⌖ מרכוז מהיר</Text>
              </Pressable>
            </View>
            <View style={st.row}>
              <Pressable style={st.toolIconBtn} onPress={() => alignImage('right')}>
                <Text style={st.toolIconGlyph}>⇥|</Text>
              </Pressable>
              <Pressable style={st.toolIconBtn} onPress={() => alignImage('centerX')}>
                <Text style={st.toolIconGlyph}>|↔|</Text>
              </Pressable>
              <Pressable style={st.toolIconBtn} onPress={() => alignImage('left')}>
                <Text style={st.toolIconGlyph}>|⇤</Text>
              </Pressable>
              <Pressable style={st.toolIconBtn} onPress={() => alignImage('top')}>
                <Text style={st.toolIconGlyph}>⤒</Text>
              </Pressable>
              <Pressable style={st.toolIconBtn} onPress={() => alignImage('centerY')}>
                <Text style={st.toolIconGlyph}>↕</Text>
              </Pressable>
              <Pressable style={st.toolIconBtn} onPress={() => alignImage('bottom')}>
                <Text style={st.toolIconGlyph}>⤓</Text>
              </Pressable>
            </View>

            <View style={st.row}>
              <Pressable
                style={[st.moreBtn, imgPanel === 'crop' && st.btnActive]}
                onPress={() => setImgPanel((p) => (p === 'crop' ? null : 'crop'))}
              >
                <Text style={[st.moreBtnText, imgPanel === 'crop' && st.textActive]}>⛶ חיתוך</Text>
              </Pressable>
              <Pressable
                style={[st.moreBtn, imgPanel === 'border' && st.btnActive]}
                onPress={() => setImgPanel((p) => (p === 'border' ? null : 'border'))}
              >
                <Text style={[st.moreBtnText, imgPanel === 'border' && st.textActive]}>▢ מסגרת</Text>
              </Pressable>
              <View style={st.stepperGroup}>
                <Pressable
                  style={st.stepBtn}
                  onPress={() => updateImg({ cornerRadius: clamp(img.cornerRadius - 4, 0, 100) })}
                >
                  <Text style={st.stepBtnText}>−</Text>
                </Pressable>
                <Text style={st.stepValue}>{img.cornerRadius}</Text>
                <Pressable
                  style={st.stepBtn}
                  onPress={() => updateImg({ cornerRadius: clamp(img.cornerRadius + 4, 0, 100) })}
                >
                  <Text style={st.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Text style={st.subLabel}>עיגול פינות</Text>

            {imgPanel === 'crop' && (
              <View>
                <Text style={st.subLabel}>הגדל/הקטן כדי לחתוך, ואז מקמו עם החצים</Text>
                <View style={st.row}>
                  <View style={st.stepperGroup}>
                    <Pressable
                      style={st.stepBtn}
                      onPress={() => updateImg({ cropScale: clamp(Math.round((img.cropScale - 0.1) * 10) / 10, 1, 3) })}
                    >
                      <Text style={st.stepBtnText}>−</Text>
                    </Pressable>
                    <Text style={st.stepValue}>{Math.round(img.cropScale * 100)}%</Text>
                    <Pressable
                      style={st.stepBtn}
                      onPress={() => updateImg({ cropScale: clamp(Math.round((img.cropScale + 0.1) * 10) / 10, 1, 3) })}
                    >
                      <Text style={st.stepBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    style={st.alignQuickBtn}
                    onPress={() => updateImg({ cropScale: 1, cropOffsetX: 0, cropOffsetY: 0 })}
                  >
                    <Text style={st.alignQuickText}>↺ איפוס חיתוך</Text>
                  </Pressable>
                </View>
                <View style={st.row}>
                  <Pressable
                    style={st.toolIconBtn}
                    onPress={() => updateImg({ cropOffsetX: clamp(img.cropOffsetX - 8, -img.w, img.w) })}
                  >
                    <Text style={st.toolIconGlyph}>⇤</Text>
                  </Pressable>
                  <Pressable
                    style={st.toolIconBtn}
                    onPress={() => updateImg({ cropOffsetX: clamp(img.cropOffsetX + 8, -img.w, img.w) })}
                  >
                    <Text style={st.toolIconGlyph}>⇥</Text>
                  </Pressable>
                  <Pressable
                    style={st.toolIconBtn}
                    onPress={() => updateImg({ cropOffsetY: clamp(img.cropOffsetY - 8, -img.h, img.h) })}
                  >
                    <Text style={st.toolIconGlyph}>⤒</Text>
                  </Pressable>
                  <Pressable
                    style={st.toolIconBtn}
                    onPress={() => updateImg({ cropOffsetY: clamp(img.cropOffsetY + 8, -img.h, img.h) })}
                  >
                    <Text style={st.toolIconGlyph}>⤓</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {imgPanel === 'border' && (
              <View>
                <View style={st.row}>
                  {BORDER_STYLES.map((b) => (
                    <Pressable
                      key={b.key}
                      style={[st.toolIconBtn, img.borderStyle === b.key && st.btnActive]}
                      onPress={() => updateImg({ borderStyle: b.key, borderWidth: b.key === 'none' ? 0 : Math.max(2, img.borderWidth) })}
                    >
                      <Text style={[st.toolIconGlyph, img.borderStyle === b.key && st.textActive]}>{b.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {img.borderStyle !== 'none' && (
                  <>
                    <View style={st.row}>
                      {TEXT_COLORS.map((c) => (
                        <Pressable
                          key={c}
                          style={[st.swatchSm, { backgroundColor: c }, img.borderColor === c && st.swatchActive]}
                          onPress={() => updateImg({ borderColor: c })}
                        />
                      ))}
                    </View>
                    <View style={st.stepperGroup}>
                      <Pressable
                        style={st.stepBtn}
                        onPress={() => updateImg({ borderWidth: clamp(img.borderWidth - 1, 1, 20) })}
                      >
                        <Text style={st.stepBtnText}>−</Text>
                      </Pressable>
                      <Text style={st.stepValue}>{img.borderWidth}</Text>
                      <Pressable
                        style={st.stepBtn}
                        onPress={() => updateImg({ borderWidth: clamp(img.borderWidth + 1, 1, 20) })}
                      >
                        <Text style={st.stepBtnText}>+</Text>
                      </Pressable>
                    </View>
                    <Text style={st.subLabel}>עובי מסגרת</Text>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* סרגל כלים קטן — כמו בקנבה, מופיע רק כשטקסט נבחר */}
        {selected && (
          <View style={st.toolbarWrap}>
            <TextInput
              style={[st.compactInput, { fontFamily: selected.font.family }]}
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
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.toolbarRow}>
              <Pressable
                style={[st.toolFontBtn, openPanel === 'font' && st.btnActive]}
                onPress={() => setOpenPanel((p) => (p === 'font' ? null : 'font'))}
              >
                <Text style={[st.toolFontText, { fontFamily: selected.font.family }]} numberOfLines={1}>
                  {selected.font.name}
                </Text>
              </Pressable>

              <Pressable
                style={[st.toolColorBtn, { backgroundColor: selected.color }]}
                onPress={() => setOpenPanel((p) => (p === 'color' ? null : 'color'))}
              />

              <View style={st.stepperGroup}>
                <Pressable
                  style={st.stepBtn}
                  onPress={() => updateSelected({ size: clamp(selected.size - 1, MIN_TEXT_SIZE, MAX_TEXT_SIZE) })}
                >
                  <Text style={st.stepBtnText}>−</Text>
                </Pressable>
                <Text style={st.stepValue}>{selected.size}</Text>
                <Pressable
                  style={st.stepBtn}
                  onPress={() => updateSelected({ size: clamp(selected.size + 1, MIN_TEXT_SIZE, MAX_TEXT_SIZE) })}
                >
                  <Text style={st.stepBtnText}>+</Text>
                </Pressable>
              </View>

              <Pressable
                style={[st.toolIconBtn, selected.bold && st.btnActive]}
                onPress={() => updateSelected({ bold: !selected.bold })}
              >
                <Text style={[st.boldText, selected.bold && st.textActive]}>B</Text>
              </Pressable>

              <Pressable
                style={[st.toolIconBtn, selected.italic && st.btnActive]}
                onPress={() => updateSelected({ italic: !selected.italic })}
              >
                <Text style={[st.italicText, selected.italic && st.textActive]}>I</Text>
              </Pressable>

              <Pressable
                style={[st.toolIconBtn, selected.underline && st.btnActive]}
                onPress={() => updateSelected({ underline: !selected.underline })}
              >
                <Text style={[st.underlineText, selected.underline && st.textActive]}>U</Text>
              </Pressable>

              <Pressable
                style={[st.toolIconBtn, selected.strikethrough && st.btnActive]}
                onPress={() => updateSelected({ strikethrough: !selected.strikethrough })}
              >
                <Text style={[st.strikeText, selected.strikethrough && st.textActive]}>S</Text>
              </Pressable>

              {ALIGNS.map((a) => (
                <Pressable
                  key={a.key}
                  style={[st.toolIconBtn, selected.align === a.key && st.btnActive]}
                  onPress={() => updateSelected({ align: a.key })}
                >
                  <Text style={[st.toolIconGlyph, selected.align === a.key && st.textActive]}>
                    {a.key === 'right' ? '⇥' : a.key === 'center' ? '↔' : '⇤'}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                style={[st.toolIconBtn, openPanel === 'highlight' && st.btnActive]}
                onPress={() => setOpenPanel((p) => (p === 'highlight' ? null : 'highlight'))}
              >
                <Text style={st.toolIconGlyph}>🖍</Text>
              </Pressable>

              <View style={st.stepperGroup}>
                <Pressable style={st.stepBtn} onPress={() => updateSelected({ spacing: clamp(selected.spacing - 1, 0, 12) })}>
                  <Text style={st.stepBtnText}>−</Text>
                </Pressable>
                <Text style={st.stepValue}>{selected.spacing}</Text>
                <Pressable style={st.stepBtn} onPress={() => updateSelected({ spacing: clamp(selected.spacing + 1, 0, 12) })}>
                  <Text style={st.stepBtnText}>+</Text>
                </Pressable>
              </View>

              <View style={st.stepperGroup}>
                <Pressable
                  style={st.stepBtn}
                  onPress={() => updateSelected({ rotation: clamp(selected.rotation - 5, -45, 45) })}
                >
                  <Text style={st.stepBtnText}>−</Text>
                </Pressable>
                <Text style={st.stepValue}>{selected.rotation}°</Text>
                <Pressable
                  style={st.stepBtn}
                  onPress={() => updateSelected({ rotation: clamp(selected.rotation + 5, -45, 45) })}
                >
                  <Text style={st.stepBtnText}>+</Text>
                </Pressable>
              </View>

              <Pressable
                style={[st.toolIconBtn, selected.outline && st.btnActive]}
                onPress={() => updateSelected({ outline: !selected.outline })}
              >
                <Text style={[st.toolIconGlyph, selected.outline && st.textActive]}>◎</Text>
              </Pressable>

              <Pressable
                style={[st.toolIconBtn, openPanel === 'align' && st.btnActive]}
                onPress={() => setOpenPanel((p) => (p === 'align' ? null : 'align'))}
              >
                <Text style={st.toolIconGlyph}>⌖</Text>
              </Pressable>

              <Pressable
                style={[st.toolIconBtn, openPanel === 'more' && st.btnActive]}
                onPress={() => setOpenPanel((p) => (p === 'more' ? null : 'more'))}
              >
                <Text style={st.toolIconGlyph}>⋯</Text>
              </Pressable>

              <Pressable style={st.toolIconBtn} onPress={sendToBack}>
                <Text style={st.toolIconGlyph}>⬇</Text>
              </Pressable>
              <Pressable style={st.toolIconBtn} onPress={bringToFront}>
                <Text style={st.toolIconGlyph}>⬆</Text>
              </Pressable>
            </ScrollView>

            {openPanel === 'align' && (
              <View style={st.alignPanel}>
                <Pressable style={st.alignQuickBtn} onPress={centerLayerOnShirt}>
                  <Text style={st.alignQuickText}>⌖ מרכוז מהיר</Text>
                </Pressable>
                <View style={st.row}>
                  <Pressable style={st.toolIconBtn} onPress={() => alignLayer('right')}>
                    <Text style={st.toolIconGlyph}>⇥|</Text>
                  </Pressable>
                  <Pressable style={st.toolIconBtn} onPress={() => alignLayer('centerX')}>
                    <Text style={st.toolIconGlyph}>|↔|</Text>
                  </Pressable>
                  <Pressable style={st.toolIconBtn} onPress={() => alignLayer('left')}>
                    <Text style={st.toolIconGlyph}>|⇤</Text>
                  </Pressable>
                  <Pressable style={st.toolIconBtn} onPress={() => alignLayer('top')}>
                    <Text style={st.toolIconGlyph}>⤒</Text>
                  </Pressable>
                  <Pressable style={st.toolIconBtn} onPress={() => alignLayer('centerY')}>
                    <Text style={st.toolIconGlyph}>↕</Text>
                  </Pressable>
                  <Pressable style={st.toolIconBtn} onPress={() => alignLayer('bottom')}>
                    <Text style={st.toolIconGlyph}>⤓</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {openPanel === 'more' && (
              <View style={st.morePanel}>
                <View style={st.row}>
                  <Pressable
                    style={[st.moreBtn, selected.shadow && st.btnActive]}
                    onPress={() => updateSelected({ shadow: !selected.shadow })}
                  >
                    <Text style={[st.moreBtnText, selected.shadow && st.textActive]}>🌑 צל</Text>
                  </Pressable>
                  <Pressable
                    style={[st.moreBtn, selected.locked && st.btnActive]}
                    onPress={() => updateSelected({ locked: !selected.locked })}
                  >
                    <Text style={[st.moreBtnText, selected.locked && st.textActive]}>🔒 נעילה</Text>
                  </Pressable>
                  <Pressable
                    style={[st.moreBtn, selected.flipH && st.btnActive]}
                    onPress={() => updateSelected({ flipH: !selected.flipH })}
                  >
                    <Text style={[st.moreBtnText, selected.flipH && st.textActive]}>⇋ אופקי</Text>
                  </Pressable>
                  <Pressable
                    style={[st.moreBtn, selected.flipV && st.btnActive]}
                    onPress={() => updateSelected({ flipV: !selected.flipV })}
                  >
                    <Text style={[st.moreBtnText, selected.flipV && st.textActive]}>⇵ אנכי</Text>
                  </Pressable>
                </View>

                <View style={st.sliderRow}>
                  <Text style={st.sliderValue}>{selected.opacity}%</Text>
                  <Slider
                    style={st.slider}
                    inverted={SLIDER_INVERTED}
                    minimumValue={10}
                    maximumValue={100}
                    step={5}
                    value={selected.opacity}
                    onSlidingStart={snapshot}
                    onValueChange={(v) => updateSelected({ opacity: Math.round(v) }, false)}
                    minimumTrackTintColor={C.accent}
                    maximumTrackTintColor={C.border}
                    thumbTintColor={C.accent}
                  />
                  <Text style={st.sliderLabel}>שקיפות</Text>
                </View>
                <View style={st.stepperGroup}>
                  <Pressable
                    style={st.stepBtn}
                    onPress={() => updateSelected({ opacity: clamp(selected.opacity - 5, 10, 100) })}
                  >
                    <Text style={st.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={st.stepValue}>{selected.opacity}%</Text>
                  <Pressable
                    style={st.stepBtn}
                    onPress={() => updateSelected({ opacity: clamp(selected.opacity + 5, 10, 100) })}
                  >
                    <Text style={st.stepBtnText}>+</Text>
                  </Pressable>
                </View>

                <View style={st.stepperGroup}>
                  <Pressable
                    style={st.stepBtn}
                    onPress={() => updateSelected({ lineHeight: clamp(Math.round((selected.lineHeight - 0.1) * 10) / 10, 1, 2) })}
                  >
                    <Text style={st.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={st.stepValue}>{selected.lineHeight.toFixed(1)}</Text>
                  <Pressable
                    style={st.stepBtn}
                    onPress={() => updateSelected({ lineHeight: clamp(Math.round((selected.lineHeight + 0.1) * 10) / 10, 1, 2) })}
                  >
                    <Text style={st.stepBtnText}>+</Text>
                  </Pressable>
                  <Text style={st.stepGroupLabel}>מרווח שורות</Text>
                </View>
              </View>
            )}

            {openPanel === 'font' && (
              <ScrollView
                ref={fontScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={st.fontRow}
                onScroll={(e) => {
                  fontScrollX.current = e.nativeEvent.contentOffset.x;
                }}
                scrollEventThrottle={16}
                {...(Platform.OS === 'web'
                  ? {
                      onWheel: (e: any) => {
                        e.preventDefault();
                        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
                        const next = Math.max(0, fontScrollX.current + delta);
                        fontScrollRef.current?.scrollTo({ x: next, animated: false });
                      },
                    }
                  : {})}
              >
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
            )}

            {openPanel === 'highlight' && (
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
            )}
          </View>
        )}

        {layers.length > 0 && <Text style={st.dragHint}>גררו את הטקסט למיקום הרצוי · הקישו לבחירה</Text>}
        {cloudUrl && !uploading && <Text style={st.okText}>✓ העיצוב נשמר בענן</Text>}

        <View style={st.rowSpread}>
          <Pressable style={st.addTextBtn} onPress={addLayer}>
            <Text style={st.addTextBtnText}>+ הוספת טקסט</Text>
          </Pressable>
          <Pressable style={st.graphicsBtn} onPress={pickImage} disabled={uploading}>
            <Text style={st.graphicsBtnText}>{localImg ? '📤 החלפת תמונה' : '📤 העלאת עיצוב'}</Text>
          </Pressable>
          <Pressable style={[st.deleteBtn, !selected && st.histBtnOff]} onPress={removeSelected} disabled={!selected}>
            <Text style={st.deleteText}>🗑 מחיקה</Text>
          </Pressable>
        </View>

        {cloudUrl && !uploading && (
          <>
            <Text style={st.label}>שדרוג העיצוב עם AI</Text>
            <View style={st.row}>
              {(
                [
                  { kind: 'bg', label: 'הסרת רקע' },
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

        <Pressable
          style={[st.outlineBtn, shirtPaletteOpen && st.btnActive]}
          onPress={() => setShirtPaletteOpen((v) => !v)}
        >
          <Text style={[st.sizeText, shirtPaletteOpen && st.textActive]}>
            {shirtPaletteOpen ? '✕ סגירת עוד צבעים' : '🎨 עוד צבעים'}
          </Text>
        </Pressable>
        {shirtPaletteOpen && (
          <ScrollView style={st.paletteScroll} nestedScrollEnabled showsVerticalScrollIndicator>
            {PALETTE_GRID.map((row, ri) => (
              <View style={st.row} key={ri}>
                {row.map((c, ci) => (
                  <Pressable
                    key={c + ci}
                    onPress={() => setShirt({ name: 'מותאם אישית', hex: c })}
                    style={[st.swatchSm, { backgroundColor: c }, shirt.hex === c && st.swatchActive]}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        )}

        <Text style={st.label}>מידה</Text>
        <View style={st.row}>
          {SIZES.map((s) => (
            <Pressable key={s} onPress={() => setSize(s)} style={[st.sizeBtn, size === s && st.btnActive]}>
              <Text style={[st.sizeText, size === s && st.textActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* השראה מהעיצובים בחנות */}
        <>
          <Text style={st.label}>עיצובים מוכנים</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.fontRow}>
            {STARTER_DESIGNS.map((d) => {
              const thumbUri = resolveDesignUri(d.source);
              return thumbUri ? (
                <Pressable key={d.slug} style={st.inspoCard} onPress={() => useStarterDesign(d)}>
                  <Image source={{ uri: thumbUri }} style={st.inspoImg} contentFit="cover" />
                </Pressable>
              ) : null;
            })}
          </ScrollView>
          <Text style={st.hint}>בוחרים עיצוב ← לוחצים "עיצוב מחדש ✨" לקבלת גרסה ייחודית משלכם</Text>
        </>

        <View style={[st.rowSpread, { flexWrap: 'nowrap' }]}>
          <Pressable style={st.graphicsBtn} onPress={() => setReadyDesignsOpen(true)}>
            <Text style={st.graphicsBtnText}>✨ עיצובים מוכנים</Text>
          </Pressable>
          <Pressable
            style={[st.nextBtn, { flex: 1, marginTop: 0 }, (!hasDesign && !localImg || uploading || ordering) && st.nextBtnDisabled]}
            disabled={(!hasDesign && !localImg) || uploading || ordering}
            onPress={continueToOrder}
          >
            {ordering ? <ActivityIndicator color={C.onAccent} /> : <Text style={st.nextBtnText}>המשך להזמנה ←</Text>}
          </Pressable>
        </View>
      </ScrollView>

      <ContextPanel
        visible={openPanel === 'color' && !!selected}
        onClose={() => setOpenPanel(null)}
        title="צבע טקסט"
        isDesktop={isDesktop}
      >
        {selected && (
          <View>
            {PALETTE_GRID.map((row, ri) => (
              <View style={st.row} key={ri}>
                {row.map((c, ci) => (
                  <Pressable
                    key={c + ci}
                    onPress={() => updateSelected({ color: c })}
                    style={[st.swatchSm, { backgroundColor: c }, selected.color === c && st.swatchActive]}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </ContextPanel>
      </View>

      {/* תצוגה מוגדלת */}
      <Modal visible={zoomOpen} transparent animationType="fade" onRequestClose={() => setZoomOpen(false)}>
        <Pressable style={st.zoomBackdrop} onPress={() => setZoomOpen(false)}>
          <View style={st.zoomShirt}>
            <View style={{ transform: [{ scale: 1.45 }] }}>
              <View style={[st.printArea, { width: AREA_W, height: AREA_H, backgroundColor: shirt.hex, borderColor: 'transparent' }]}>
                {localImg && (
                  <View
                    style={{
                      position: 'absolute',
                      left: img.x - img.w / 2,
                      top: img.y - img.h / 2,
                      width: img.w,
                      height: img.h,
                      opacity: img.opacity / 100,
                      borderRadius: img.cornerRadius,
                      overflow: 'hidden',
                      borderWidth: img.borderStyle === 'none' ? 0 : img.borderWidth,
                      borderColor: img.borderColor,
                      borderStyle: img.borderStyle === 'none' ? 'solid' : img.borderStyle,
                      transform: [
                        { rotate: `${img.rotation}deg` },
                        { scaleX: img.flipH ? -1 : 1 },
                        { scaleY: img.flipV ? -1 : 1 },
                      ],
                    }}
                  >
                    <Image
                      source={{ uri: localImg }}
                      style={[
                        st.printImg,
                        {
                          width: img.w * img.cropScale,
                          height: img.h * img.cropScale,
                          left: img.cropOffsetX,
                          top: img.cropOffsetY,
                        },
                      ]}
                      contentFit="fill"
                    />
                  </View>
                )}
                {layers.map((l) => (
                  <View
                    key={l.id}
                    style={[
                      st.layerWrap,
                      l.width != null && { width: l.width },
                      l.height != null && { height: l.height, justifyContent: 'center' },
                      {
                        left: l.x,
                        top: l.y,
                        opacity: l.opacity / 100,
                        transform: [
                          { translateX: '-50%' as never },
                          { translateY: '-50%' as never },
                          { rotate: `${l.rotation}deg` },
                          { scaleX: l.flipH ? -1 : 1 },
                          { scaleY: l.flipV ? -1 : 1 },
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
                          lineHeight: Math.round(l.size * l.lineHeight),
                          textAlign: l.align,
                          letterSpacing: l.spacing,
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
                        l.highlight != null && {
                          backgroundColor: l.highlight,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 3,
                        },
                        l.outline
                          ? {
                              textShadowColor: l.color === '#000000' ? '#ffffff' : '#000000',
                              textShadowRadius: 3,
                              textShadowOffset: { width: 0, height: 0 },
                            }
                          : l.shadow
                            ? { textShadowColor: '#00000099', textShadowRadius: 4, textShadowOffset: { width: 2, height: 3 } }
                            : null,
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

      {/* פאנל עיצובים מוכנים — גלריית תמונות מוכנות מראש */}
      <Modal
        visible={readyDesignsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReadyDesignsOpen(false)}
      >
        <View style={st.graphicsBackdrop}>
          <View style={st.graphicsSheet}>
            <View style={st.graphicsHeader}>
              <Text style={st.graphicsTitle}>עיצובים מוכנים</Text>
              <Pressable onPress={() => setReadyDesignsOpen(false)} hitSlop={8}>
                <Text style={st.graphicsClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={st.graphicsScroll}>
              <View style={st.graphicsGrid}>
                {READY_DESIGNS.map((d) => {
                  const thumbUri = resolveDesignUri(d.source);
                  return (
                    <Pressable key={d.slug} style={st.readyDesignCell} onPress={() => useReadyDesign(d)}>
                      {thumbUri && <Image source={{ uri: thumbUri }} style={st.readyDesignImg} contentFit="cover" />}
                      <Text style={st.readyDesignLabel}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
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
    borderRadius: R.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printArea: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  printHint: { fontSize: 14, fontWeight: '600' },
  layerWrap: { position: 'absolute' },
  textInner: { flex: 1, justifyContent: 'center' },
  layerSelected: { borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed', borderRadius: 4 },
  imgSelectedBorder: {
    ...(StyleSheet.absoluteFill as object),
    borderWidth: 1,
    borderColor: C.accent,
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  lockBadge: {
    position: 'absolute',
    top: -20,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadgeText: { fontSize: 11 },
  dragHint: { color: C.textDim, fontSize: 12, textAlign: 'center', marginTop: 6 },
  zoomBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 38,
    height: 38,
    borderRadius: R.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: { fontSize: 17, color: C.onAccent },
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
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
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
  sidePanelDesktop: {
    width: 280,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
    backgroundColor: C.bg,
  },
  sidePanelHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sidePanelTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  sidePanelClose: { color: C.textDim, fontSize: 20, fontWeight: '800' },
  sidePanelBody: { padding: S.md },
  bottomSheetBackdrop: { flex: 1, backgroundColor: '#000000aa' },
  bottomSheetPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    backgroundColor: C.bg,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  graphicsBackdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  graphicsSheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    height: '80%',
    padding: S.md,
  },
  graphicsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  graphicsTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  graphicsClose: { color: C.textDim, fontSize: 20, fontWeight: '800' },
  graphicsScroll: { paddingBottom: S.xl },
  graphicsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: S.sm },
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
  readyDesignCell: {
    width: 100,
    borderRadius: R.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  readyDesignImg: { width: '100%', height: 100 },
  readyDesignLabel: {
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 6,
  },
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
  rowSpread: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: S.sm, marginTop: S.md },
  addTextBtn: { backgroundColor: C.accent, borderRadius: R.full, paddingVertical: 11, paddingHorizontal: 20 },
  addTextBtnText: { color: C.onAccent, fontSize: 15, fontWeight: '800' },
  graphicsBtn: {
    borderRadius: R.full,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  graphicsBtnText: { color: C.accent, fontSize: 15, fontWeight: '800' },
  deleteBtn: {
    borderWidth: 1.5,
    borderColor: C.danger,
    borderRadius: R.full,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  deleteText: { color: C.danger, fontSize: 14, fontWeight: '800' },
  toolbarWrap: {
    marginTop: S.sm,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.sm,
  },
  compactInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    color: C.text,
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 12,
    textAlign: 'right',
    marginBottom: S.sm,
  },
  toolbarRow: { flexDirection: 'row', gap: S.xs, alignItems: 'center' },
  toolFontBtn: {
    minWidth: 64,
    maxWidth: 90,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  toolFontText: { color: C.text, fontSize: 13, fontWeight: '700' },
  toolColorBtn: {
    width: 34,
    height: 34,
    borderRadius: R.full,
    borderWidth: 2,
    borderColor: C.border,
  },
  toolIconBtn: {
    width: 34,
    height: 34,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconGlyph: { color: C.textDim, fontSize: 16, fontWeight: '700' },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  stepBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  stepBtnText: { color: C.accent, fontSize: 16, fontWeight: '800' },
  stepValue: { color: C.text, fontSize: 13, fontWeight: '700', minWidth: 30, textAlign: 'center' },
  stepGroupLabel: { color: C.textDim, fontSize: 12, fontWeight: '700', marginRight: S.sm },
  alignPanel: { marginTop: S.sm, gap: S.sm },
  alignQuickBtn: {
    alignSelf: 'flex-end',
    backgroundColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  alignQuickText: { color: C.onAccent, fontSize: 13, fontWeight: '800' },
  morePanel: { marginTop: S.sm, gap: S.md },
  moreBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  moreBtnText: { color: C.textDim, fontSize: 13, fontWeight: '700' },
  zOrderBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: R.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  zOrderText: { color: C.text, fontSize: 13, fontWeight: '700' },
  boldText: { color: C.textDim, fontSize: 17, fontWeight: '900' },
  paletteScroll: { maxHeight: 220 },
  italicText: { color: C.textDim, fontSize: 17, fontStyle: 'italic', fontWeight: '600' },
  underlineText: { color: C.textDim, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  strikeText: { color: C.textDim, fontSize: 15, fontWeight: '700', textDecorationLine: 'line-through' },
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
