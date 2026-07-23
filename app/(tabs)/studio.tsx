import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
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

// פריסטים של אפקט גרדיאנט לטקסט (בסגנון METAL/CHROM/80s) — צבעי המעבר להצגה בדפדפן (web),
// ו-fallbackColor כצבע אחיד לתצוגה במכשיר נייד/אפליקציה, כי גרדיאנט אמיתי על טקסט דורש
// ספריית מסכה (MaskedView) שעדיין לא מותקנת בפרויקט
type GradientPreset = { key: string; label: string; colors: string[]; fallbackColor: string };
const GRADIENT_PRESETS: GradientPreset[] = [
  { key: 'metal', label: 'מתכת', colors: ['#e8e8e8', '#8c8c8c', '#e8e8e8'], fallbackColor: '#b0b0b0' },
  { key: 'gold', label: 'זהב', colors: ['#fff6b0', '#d4af37', '#7a5c00'], fallbackColor: '#d4af37' },
  { key: 'neon', label: 'ניאון', colors: ['#00fff2', '#00ff6a'], fallbackColor: '#00ffae' },
  { key: 'fire', label: 'אש', colors: ['#fff200', '#ff7a00', '#ff003c'], fallbackColor: '#ff7a00' },
  { key: 'ice', label: 'קרח', colors: ['#e0faff', '#37a7ff', '#0047ab'], fallbackColor: '#37a7ff' },
  { key: 'rainbow', label: 'קשת', colors: ['#ff3b6b', '#ffd400', '#00fc25', '#37a7ff', '#a259ff'], fallbackColor: '#a259ff' },
];

// מחזיר override לסטייל טקסט שמצייר את הגרדיאנט האמיתי — עובד רק בדפדפן (web), כי גרדיאנט אמיתי
// על טקסט בנייד/אפליקציה דורש ספריית מסכה (MaskedView) שעדיין לא מותקנת בפרויקט.
// באפליקציה עצמה מוצג במקום זאת הצבע האחיד fallbackColor שכבר נשמר בשדה color של השכבה.
function gradientWebStyle(gradientKey: string | null): Record<string, any> | null {
  if (!gradientKey || Platform.OS !== 'web') return null;
  const preset = GRADIENT_PRESETS.find((g) => g.key === gradientKey);
  if (!preset) return null;
  return {
    backgroundImage: `linear-gradient(90deg, ${preset.colors.join(', ')})`,
    color: 'transparent',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };
}

type Graphic = { char: string; keywords: string[] };
type GraphicCategory = { name: string; items: Graphic[] };

const GRAPHIC_CATEGORIES: GraphicCategory[] = [
  {
    name: 'מועדפים',
    items: [
      { char: '❤️', keywords: ['לב', 'אהבה'] },
      { char: '⚡', keywords: ['ברק', 'חשמל'] },
      { char: '👑', keywords: ['כתר'] },
      { char: '⭐', keywords: ['כוכב'] },
      { char: '🔥', keywords: ['אש'] },
      { char: '😎', keywords: ['משקפי שמש', 'מגניב'] },
      { char: '🎉', keywords: ['מסיבה', 'חגיגה'] },
      { char: '🦄', keywords: ['חד קרן'] },
      { char: '⚽', keywords: ['כדורגל'] },
      { char: '🎸', keywords: ['גיטרה'] },
      { char: '💪', keywords: ['שריר', 'כוח'] },
      { char: '🌈', keywords: ['קשת'] },
    ],
  },
  {
    name: 'תגים וחותמות',
    items: [
      { char: '🏅', keywords: ['מדליה', 'תג'] },
      { char: '🎖️', keywords: ['מדליה', 'עיטור'] },
      { char: '🥇', keywords: ['זהב', 'מקום ראשון'] },
      { char: '🥈', keywords: ['כסף', 'מקום שני'] },
      { char: '🥉', keywords: ['ארד', 'מקום שלישי'] },
      { char: '🏆', keywords: ['גביע', 'ניצחון'] },
      { char: '🛡️', keywords: ['מגן', 'שריון'] },
      { char: '⚜️', keywords: ['סמל', 'צרפתי'] },
      { char: '📛', keywords: ['תג שם'] },
      { char: '🔖', keywords: ['סימנייה', 'תג'] },
      { char: '✅', keywords: ['וי', 'אישור'] },
      { char: '☑️', keywords: ['וי', 'תיבת סימון'] },
      { char: '💯', keywords: ['מאה', 'מושלם'] },
      { char: '🔰', keywords: ['סמל', 'התחלה'] },
    ],
  },
  {
    name: 'פרחים וטבע',
    items: [
      { char: '🌸', keywords: ['פרח', 'ורוד'] },
      { char: '🌺', keywords: ['פרח', 'היביסקוס'] },
      { char: '🌻', keywords: ['פרח', 'חמנייה'] },
      { char: '🌼', keywords: ['פרח', 'חינניות'] },
      { char: '🌷', keywords: ['פרח', 'צבעוני'] },
      { char: '🌹', keywords: ['פרח', 'ורד'] },
      { char: '🍀', keywords: ['תלתן', 'מזל'] },
      { char: '🌳', keywords: ['עץ'] },
      { char: '🌲', keywords: ['עץ', 'אורן'] },
      { char: '🌴', keywords: ['דקל'] },
      { char: '🍁', keywords: ['עלה', 'סתיו'] },
      { char: '🌵', keywords: ['קקטוס'] },
      { char: '🌊', keywords: ['ים', 'גל'] },
      { char: '☀️', keywords: ['שמש'] },
    ],
  },
  {
    name: 'בעלי חיים',
    items: [
      { char: '🐶', keywords: ['כלב'] },
      { char: '🐱', keywords: ['חתול'] },
      { char: '🐰', keywords: ['ארנב'] },
      { char: '🐻', keywords: ['דוב'] },
      { char: '🦁', keywords: ['אריה'] },
      { char: '🐯', keywords: ['נמר'] },
      { char: '🐨', keywords: ['קואלה'] },
      { char: '🐼', keywords: ['פנדה'] },
      { char: '🦊', keywords: ['שועל'] },
      { char: '🐸', keywords: ['צפרדע'] },
      { char: '🦄', keywords: ['חד קרן'] },
      { char: '🐝', keywords: ['דבורה'] },
      { char: '🦋', keywords: ['פרפר'] },
      { char: '🐬', keywords: ['דולפין'] },
      { char: '🦉', keywords: ['ינשוף'] },
      { char: '🐢', keywords: ['צב'] },
    ],
  },
  {
    name: 'אוכל ומשקאות',
    items: [
      { char: '🍕', keywords: ['פיצה'] },
      { char: '🍔', keywords: ['המבורגר'] },
      { char: '🍟', keywords: ['צ׳יפס'] },
      { char: '🌮', keywords: ['טאקו'] },
      { char: '🍩', keywords: ['דונאט', 'סופגנייה'] },
      { char: '🍪', keywords: ['עוגייה'] },
      { char: '🎂', keywords: ['עוגה', 'יום הולדת'] },
      { char: '🍦', keywords: ['גלידה'] },
      { char: '🍰', keywords: ['עוגה'] },
      { char: '🍫', keywords: ['שוקולד'] },
      { char: '🍿', keywords: ['פופקורן'] },
      { char: '🥤', keywords: ['שתייה'] },
      { char: '☕', keywords: ['קפה'] },
      { char: '🍺', keywords: ['בירה'] },
    ],
  },
  {
    name: 'מסיבות ואירועים',
    items: [
      { char: '🎉', keywords: ['מסיבה', 'חגיגה'] },
      { char: '🎊', keywords: ['קונפטי'] },
      { char: '🎈', keywords: ['בלון'] },
      { char: '🎁', keywords: ['מתנה'] },
      { char: '🎀', keywords: ['סרט'] },
      { char: '🥳', keywords: ['חגיגה'] },
      { char: '🎆', keywords: ['זיקוקים'] },
      { char: '🎇', keywords: ['זיקוקים'] },
      { char: '🍾', keywords: ['שמפניה'] },
      { char: '🥂', keywords: ['כוסות', 'לחיים'] },
    ],
  },
  {
    name: 'ספורט',
    items: [
      { char: '⚽', keywords: ['כדורגל'] },
      { char: '🏀', keywords: ['כדורסל'] },
      { char: '🏈', keywords: ['פוטבול'] },
      { char: '⚾', keywords: ['בייסבול'] },
      { char: '🎾', keywords: ['טניס'] },
      { char: '🏐', keywords: ['כדורעף'] },
      { char: '🏓', keywords: ['טניס שולחן'] },
      { char: '🥊', keywords: ['אגרוף'] },
      { char: '🏆', keywords: ['גביע', 'ניצחון'] },
      { char: '🥇', keywords: ['מדליה', 'זהב'] },
    ],
  },
  {
    name: 'סמלים ולבבות',
    items: [
      { char: '❤️', keywords: ['לב', 'אהבה', 'אדום'] },
      { char: '💛', keywords: ['לב', 'צהוב'] },
      { char: '💚', keywords: ['לב', 'ירוק'] },
      { char: '💙', keywords: ['לב', 'כחול'] },
      { char: '💜', keywords: ['לב', 'סגול'] },
      { char: '🖤', keywords: ['לב', 'שחור'] },
      { char: '🤍', keywords: ['לב', 'לבן'] },
      { char: '💔', keywords: ['לב שבור'] },
      { char: '✨', keywords: ['נצנצים'] },
      { char: '⭐', keywords: ['כוכב'] },
      { char: '🌟', keywords: ['כוכב', 'זוהר'] },
      { char: '🔥', keywords: ['אש'] },
    ],
  },
  {
    name: 'תחבורה',
    items: [
      { char: '🚗', keywords: ['מכונית'] },
      { char: '🚕', keywords: ['מונית'] },
      { char: '🚌', keywords: ['אוטובוס'] },
      { char: '🚑', keywords: ['אמבולנס'] },
      { char: '🚒', keywords: ['כבאית'] },
      { char: '🚀', keywords: ['רקטה', 'חלל'] },
      { char: '✈️', keywords: ['מטוס'] },
      { char: '🚁', keywords: ['מסוק'] },
      { char: '⛵', keywords: ['סירה'] },
      { char: '🚲', keywords: ['אופניים'] },
      { char: '🏍️', keywords: ['אופנוע'] },
    ],
  },
  {
    name: 'מזג אוויר',
    items: [
      { char: '🌤️', keywords: ['שמש', 'עננים'] },
      { char: '⛅', keywords: ['עננים'] },
      { char: '🌧️', keywords: ['גשם'] },
      { char: '⛈️', keywords: ['סופה', 'רעם'] },
      { char: '❄️', keywords: ['שלג'] },
      { char: '🌈', keywords: ['קשת'] },
      { char: '☔', keywords: ['מטריה'] },
      { char: '🌙', keywords: ['ירח'] },
    ],
  },
];

const ALIGNS = [
  { key: 'right', label: 'ימין' },
  { key: 'center', label: 'מרכז' },
  { key: 'left', label: 'שמאל' },
] as const;

// תיקון RTL: הסליידר מתהפך בממשק עברי, אז הופכים אותו חזרה
const SLIDER_INVERTED = Platform.OS === 'web' ? true : I18nManager.isRTL;

const AREA_W = 230;
const AREA_H = 280;
const TEMPLATE_THUMB_W = 110;
const TEMPLATE_THUMB_H = Math.round((TEMPLATE_THUMB_W * AREA_H) / AREA_W);

type Layer = {
  id: number;
  text: string;
  font: (typeof FONTS)[number];
  color: string;
  gradient: string | null; // מפתח פריסט מ-GRADIENT_PRESETS, או null לצבע רגיל
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
  locked: boolean;
  opacity: number; // 0-100
  shadow: boolean;
  lineHeight: number; // מכפיל (1.0-2.0) על גודל הפונט
  flipH: boolean;
  flipV: boolean;
  hidden: boolean;
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
  hidden: boolean;
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
  hidden: false,
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

const MIN_IMG_SIZE = 30;
const MAX_IMG_SIZE = AREA_W - 6;

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
    case 'e':
      return { w: clamp(Math.round(base.w + dx), MIN_IMG_SIZE, MAX_IMG_SIZE), x: Math.round(base.x + dx / 2) };
    case 'w':
      return { w: clamp(Math.round(base.w - dx), MIN_IMG_SIZE, MAX_IMG_SIZE), x: Math.round(base.x + dx / 2) };
    case 's':
      return { h: clamp(Math.round(base.h + dy), MIN_IMG_SIZE, MAX_IMG_SIZE), y: Math.round(base.y + dy / 2) };
    case 'n':
      return { h: clamp(Math.round(base.h - dy), MIN_IMG_SIZE, MAX_IMG_SIZE), y: Math.round(base.y + dy / 2) };
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
      onStartShouldSetPanResponder: () => !imgRef.current.locked,
      onMoveShouldSetPanResponder: (_e, g) => !imgRef.current.locked && Math.abs(g.dx) + Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        start.current = { x: imgRef.current.x, y: imgRef.current.y };
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
          img.cropScale !== 1 || img.cropOffsetX !== 0 || img.cropOffsetY !== 0
            ? {
                width: `${img.cropScale * 100}%` as any,
                height: `${img.cropScale * 100}%` as any,
                left: img.cropOffsetX,
                top: img.cropOffsetY,
              }
            : null,
        ]}
        contentFit="contain"
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

function newLayer(): Layer {
  return {
    id: nextId++,
    text: 'הטקסט שלי',
    font: FONTS[0],
    color: '#ffffff',
    gradient: null,
    size: 26,
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
    hidden: false,
  };
}

// ספריית תבניות מוכנות — כל תבנית היא שילוב מוכן של שכבות טקסט (וגרפיקות, שהן גם שכבות טקסט
// עם אמוג'י) על בסיס מנגנון השכבות הקיים, בלי צורך בתמונות או ספריות חדשות
const FONT_BY_FAMILY = (family: string) => FONTS.find((f) => f.family === family) ?? FONTS[0];

type TemplateLayerDef = Partial<Layer> & { text: string };
type TemplateDef = { id: string; name: string; shirtHex?: string; layers: TemplateLayerDef[] };

const TEMPLATES: TemplateDef[] = [
  {
    id: 'summer-sale',
    name: 'מבצע קיץ',
    shirtHex: '#1b1b1b',
    layers: [
      { text: 'SALE', font: FONT_BY_FAMILY('SuezOne'), color: '#ffd400', size: 60, x: AREA_W / 2, y: AREA_H / 2 - 28, bold: true, rotation: -4 },
      { text: 'עד 50% הנחה', font: FONT_BY_FAMILY('Heebo'), color: '#ffffff', size: 20, x: AREA_W / 2, y: AREA_H / 2 + 36, bold: true },
    ],
  },
  {
    id: 'birthday',
    name: 'יום הולדת',
    shirtHex: '#f2f2f2',
    layers: [
      { text: 'מזל טוב!', font: FONT_BY_FAMILY('VarelaRound'), color: '#ff3b6b', size: 44, x: AREA_W / 2, y: AREA_H / 2 - 20 },
      { text: '🎉', size: 42, x: AREA_W / 2 - 60, y: AREA_H / 2 - 20, rotation: -10 },
      { text: '🎂', size: 42, x: AREA_W / 2 + 60, y: AREA_H / 2 - 20, rotation: 10 },
    ],
  },
  {
    id: 'team',
    name: 'קבוצה / צוות',
    shirtHex: '#1b1b1b',
    layers: [
      { text: 'TEAM', font: FONT_BY_FAMILY('Karantina'), color: '#37a7ff', size: 56, x: AREA_W / 2, y: AREA_H / 2 - 30, bold: true, outline: true },
      { text: 'שם הקבוצה', font: FONT_BY_FAMILY('Rubik'), color: '#ffffff', size: 18, x: AREA_W / 2, y: AREA_H / 2 + 34, spacing: 2 },
    ],
  },
  {
    id: 'minimal',
    name: 'מינימליסטי',
    shirtHex: '#f2f2f2',
    layers: [
      { text: 'שם / מילה', font: FONT_BY_FAMILY('DavidLibre'), color: '#1b1b1b', size: 30, x: AREA_W / 2, y: AREA_H / 2 },
    ],
  },
  {
    id: 'retro-neon',
    name: 'רטרו ניאון',
    shirtHex: '#1b1b1b',
    layers: [
      { text: 'RETRO', font: FONT_BY_FAMILY('SuezOne'), color: '#00fc25', gradient: 'neon', size: 58, x: AREA_W / 2, y: AREA_H / 2, bold: true, shadow: true },
    ],
  },
  {
    id: 'toast',
    name: 'לחיים!',
    shirtHex: '#1b1b1b',
    layers: [
      { text: 'לחיים!', font: FONT_BY_FAMILY('FrankRuhl'), color: '#ffd400', gradient: 'gold', size: 46, x: AREA_W / 2, y: AREA_H / 2 - 20 },
      { text: '🥂', size: 40, x: AREA_W / 2, y: AREA_H / 2 + 34 },
    ],
  },
];

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
      onStartShouldSetPanResponder: () => !layerRef.current.locked,
      onMoveShouldSetPanResponder: (_e, g) => !layerRef.current.locked && Math.abs(g.dx) + Math.abs(g.dy) > 2,
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
      {...pan.panHandlers}
      onLayout={(e) => {
        const next = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        measuredRef.current = next;
        setMeasured(next);
        onMeasured?.(next.w, next.h);
      }}
      style={[
        st.layerWrap,
        layer.width != null && { width: layer.width },
        {
          left: layer.x,
          top: layer.y,
          opacity: layer.opacity / 100,
          transform: [
            { translateX: '-50%' as never },
            { translateY: '-50%' as never },
            { rotate: `${layer.rotation}deg` },
            { scaleX: layer.flipH ? -1 : 1 },
            { scaleY: layer.flipV ? -1 : 1 },
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
          gradientWebStyle(layer.gradient),
          textShadow,
        ]}
        numberOfLines={layer.width != null ? undefined : 3}
      >
        {layer.text}
      </Text>
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
          const HIT = 34;
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
        if (d.localImg) setLocalImg(d.localImg);
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
        if (d.img) setImg({ ...DEFAULT_IMG, ...d.img });
      })
      .catch(() => {})
      .finally(() => {
        draftLoaded.current = true;
      });
  }, []);

  useEffect(() => {
    if (!draftLoaded.current) return;
    const t = setTimeout(() => {
      const hasContent = layers.some((l) => l.text.trim()) || !!localImg;
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
    snapshot();
    setLocalImg(null);
    setCloudUrl(null);
    setImg(DEFAULT_IMG);
    setImageSelected(false);
    setNaturalImgSize(null);
    setHasTransparency(false);
  }

  // מתאים את תיבת התמונה לגודל טבעי (שומר על יחס הממדים), וגם שומר את הרזולוציה האמיתית
  // לצורך בדיקת איכות ההדפסה
  function fitImageBox(url: string) {
    RNImage.getSize(
      url,
      (w, h) => {
        setNaturalImgSize({ w, h });
        const ratio = w / h;
        let dw = 150;
        let dh = dw / ratio;
        const maxH = AREA_H - 20;
        if (dh > maxH) {
          dh = maxH;
          dw = dh * ratio;
        }
        setImg((prev) => ({ ...prev, w: Math.round(dw), h: Math.round(dh), x: AREA_W / 2, y: AREA_H / 2 }));
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

  function duplicateSelected() {
    if (selectedId == null || !selected) return;
    snapshot();
    const copy: Layer = { ...selected, id: nextId++, x: selected.x + 14, y: selected.y + 14 };
    setLayers((ls) => [...ls, copy]);
    setSelectedId(copy.id);
  }

  // העתק סגנון (format painter) — מעתיק את מאפייני העיצוב של השכבה הנבחרת (טקסט או תמונה) כדי
  // להדביק על שכבה אחרת. בין שכבות מאותו סוג מועתק הסגנון המלא; בין טקסט לתמונה (ולהפך) מועתקים
  // רק המאפיינים המשותפים (סיבוב, היפוך, שקיפות), כי לשאר המאפיינים אין מקבילה בסוג השני
  function copyStyle() {
    if (imageSelected) {
      const { x, y, locked, ...style } = img;
      setCopiedStyle({ kind: 'image', style });
    } else if (selected) {
      const { text, x, y, id, locked, ...style } = selected;
      setCopiedStyle({ kind: 'text', style });
    }
  }

  function pasteStyle() {
    if (!copiedStyle) return;
    if (imageSelected) {
      if (copiedStyle.kind === 'image') {
        updateImg(copiedStyle.style);
      } else {
        const { rotation, flipH, flipV, opacity } = copiedStyle.style;
        updateImg({ rotation, flipH, flipV, opacity });
      }
    } else if (selected) {
      if (copiedStyle.kind === 'text') {
        updateSelected(copiedStyle.style);
      } else {
        const { rotation, flipH, flipV, opacity } = copiedStyle.style;
        updateSelected({ rotation, flipH, flipV, opacity });
      }
    }
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

  // הזזת שכבה צעד אחד קדימה/אחורה בסדר (לשימוש בפאנל השכבות)
  function moveLayerUp(id: number) {
    snapshot();
    setLayers((ls) => {
      const idx = ls.findIndex((l) => l.id === id);
      if (idx < 0 || idx === ls.length - 1) return ls;
      const copy = [...ls];
      [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
      return copy;
    });
  }

  function moveLayerDown(id: number) {
    snapshot();
    setLayers((ls) => {
      const idx = ls.findIndex((l) => l.id === id);
      if (idx <= 0) return ls;
      const copy = [...ls];
      [copy[idx], copy[idx - 1]] = [copy[idx - 1], copy[idx]];
      return copy;
    });
  }

  function toggleLayerHidden(id: number) {
    snapshot();
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, hidden: !l.hidden } : l)));
  }

  function toggleImgHidden() {
    updateImg({ hidden: !img.hidden });
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
  const [copiedStyle, setCopiedStyle] = useState<
    { kind: 'text'; style: Partial<Layer> } | { kind: 'image'; style: Partial<ImgTransform> } | null
  >(null);
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
  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const [graphicsQuery, setGraphicsQuery] = useState('');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

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

  // טעינת תבנית מוכנה — מחליפה את שכבות הטקסט הנוכחיות (התמונה, אם יש, נשארת כמות שהיא)
  function applyDesignTemplate(tpl: TemplateDef) {
    const hasExistingText = layers.some((l) => l.text.trim());
    const doApply = () => {
      snapshot();
      const built = tpl.layers.map((partial) => ({ ...newLayer(), ...partial, id: nextId++ }));
      setLayers(built);
      setSelectedId(null);
      setImageSelected(false);
      if (tpl.shirtHex) {
        const found = SHIRT_COLORS.find((c) => c.hex === tpl.shirtHex);
        setShirt(found ?? { name: 'מותאם אישית', hex: tpl.shirtHex });
      }
      setTemplatesOpen(false);
    };
    if (hasExistingText) {
      Alert.alert('טעינת תבנית', 'הפעולה תחליף את הטקסטים הקיימים על החולצה. להמשיך?', [
        { text: 'ביטול', style: 'cancel' },
        { text: 'טעינה', style: 'destructive', onPress: doApply },
      ]);
    } else {
      doApply();
    }
  }

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
      if (cloudUrl && !img.hidden) attributes.push({ key: 'קובץ עיצוב', value: cloudUrl });
      layers
        .filter((l) => l.text.trim() && !l.hidden)
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
      if (cloudUrl && !img.hidden) {
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
          image: img.hidden ? undefined : cloudUrl,
          imageTransform: cloudUrl && !img.hidden
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
            .filter((l) => l.text.trim() && !l.hidden)
            .map((l) => ({
              text: l.text,
              fontFamily: l.font.family,
              color: l.color,
              gradient: l.gradient,
              size: l.size,
              width: l.width,
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
      <ScrollView
        contentContainerStyle={st.scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!scrollLocked}
      >
        <View style={st.headerRow}>
          <Text style={st.title}>סטודיו עיצוב</Text>
          <View style={st.historyRow}>
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
                style={[
                  st.toolColorBtn,
                  { backgroundColor: selected.color },
                  selected.gradient != null && Platform.OS === 'web'
                    ? ({ backgroundImage: `linear-gradient(90deg, ${GRADIENT_PRESETS.find((g) => g.key === selected.gradient)?.colors.join(', ')})` } as any)
                    : null,
                ]}
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

            {openPanel === 'color' && (
              <View>
                <Text style={st.subLabel}>אפקט גרדיאנט</Text>
                <View style={st.row}>
                  {GRADIENT_PRESETS.map((g) => (
                    <Pressable
                      key={g.key}
                      onPress={() => updateSelected({ gradient: g.key, color: g.fallbackColor })}
                      style={[
                        st.gradientSwatch,
                        Platform.OS === 'web'
                          ? ({ backgroundImage: `linear-gradient(90deg, ${g.colors.join(', ')})` } as any)
                          : { backgroundColor: g.fallbackColor },
                        selected.gradient === g.key && st.swatchActive,
                      ]}
                    >
                      <Text style={st.gradientSwatchLabel}>{g.label}</Text>
                    </Pressable>
                  ))}
                  {selected.gradient != null && (
                    <Pressable
                      onPress={() => updateSelected({ gradient: null })}
                      style={[st.gradientSwatch, { backgroundColor: C.bg }]}
                    >
                      <Text style={st.gradientSwatchLabel}>✕ ביטול</Text>
                    </Pressable>
                  )}
                </View>
                {Platform.OS !== 'web' && (
                  <Text style={st.hint}>באפליקציה הגרדיאנט מוצג כצבע אחיד קרוב — התצוגה המלאה זמינה כרגע בדפדפן</Text>
                )}
                <Text style={st.subLabel}>צבע רגיל</Text>
                <ScrollView style={st.paletteScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                  {PALETTE_GRID.map((row, ri) => (
                    <View style={st.row} key={ri}>
                      {row.map((c, ci) => (
                        <Pressable
                          key={c + ci}
                          onPress={() => updateSelected({ color: c, gradient: null })}
                          style={[st.swatchSm, { backgroundColor: c }, selected.color === c && selected.gradient == null && st.swatchActive]}
                        />
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </View>
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

        {/* תצוגה מקדימה */}
        <View style={[st.shirtPreview, { backgroundColor: shirt.hex }]}>
          <View style={[st.printArea, { borderColor: lightShirt ? '#00000022' : '#ffffff22' }]}>
            {localImg && !img.hidden && (
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
            {layers.filter((l) => !l.hidden).map((l) => (
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
          </View>
          {uploading && (
            <View style={st.uploadOverlay}>
              <ActivityIndicator color={C.accent} size="large" />
              <Text style={st.uploadText}>מעלה את העיצוב…</Text>
            </View>
          )}
          <Pressable style={st.zoomBtn} onPress={() => setZoomOpen(true)} hitSlop={8}>
            <Text style={st.zoomBtnText}>⛶</Text>
          </Pressable>
          {localImg && !uploading && (
            <Pressable style={st.removeImgBtn} onPress={removeImage} hitSlop={8}>
              <Text style={st.removeImgText}>✕</Text>
            </Pressable>
          )}
        </View>
        {layers.length > 0 && <Text style={st.dragHint}>גררו את הטקסט למיקום הרצוי · הקישו לבחירה</Text>}
        {cloudUrl && !uploading && <Text style={st.okText}>✓ העיצוב נשמר בענן</Text>}

        {/* עצת איכות הדפסה — הערכה כללית, לא מפרט הדפסה רשמי */}
        {(naturalImgSize || layers.length > 0) && (
          <View style={st.adviceBox}>
            <Text style={st.adviceTitle}>בדיקת איכות מהירה</Text>
            {naturalImgSize && Math.min(naturalImgSize.w, naturalImgSize.h) < 1000 && (
              <Text style={st.adviceLine}>⚠️ רזולוציית התמונה נמוכה יחסית — ההדפסה עלולה לצאת מטושטשת</Text>
            )}
            {naturalImgSize && img.w / AREA_W < 0.25 && (
              <Text style={st.adviceLine}>⚠️ התמונה קטנה על החולצה — כדאי להגדיל להדפסה בולטת יותר</Text>
            )}
            {hasTransparency && (
              <Text style={st.adviceLine}>ℹ️ לעיצוב יש רקע שקוף — ודאו שזה מתאים לצבע החולצה שבחרתם</Text>
            )}
            {layers
              .filter((l) => l.text.trim() && !l.hidden && colorDistance(l.color, shirt.hex) < 60)
              .map((l) => (
                <Text key={l.id} style={st.adviceLine}>
                  ⚠️ הטקסט "{l.text.trim().slice(0, 12)}" קרוב בצבעו לצבע החולצה — עלול לא לבלוט
                </Text>
              ))}
            {!layers.some((l) => l.text.trim() && !l.hidden && colorDistance(l.color, shirt.hex) < 60) &&
              !hasTransparency &&
              !(naturalImgSize && (Math.min(naturalImgSize.w, naturalImgSize.h) < 1000 || img.w / AREA_W < 0.25)) && (
                <Text style={st.adviceLineOk}>✓ נראה תקין להדפסה</Text>
              )}
            <Text style={st.adviceFooter}>הערכה כללית בלבד — לא תחליף לבדיקת דפוס מקצועית</Text>
          </View>
        )}

        <View style={st.rowSpread}>
          {selected && (
            <Pressable style={st.deleteBtn} onPress={removeSelected}>
              <Text style={st.deleteText}>🗑 מחיקה</Text>
            </Pressable>
          )}
          {selected && (
            <Pressable style={st.deleteBtn} onPress={duplicateSelected}>
              <Text style={st.deleteText}>⧉ שכפול</Text>
            </Pressable>
          )}
          {(selected || imageSelected) && (
            <Pressable style={st.deleteBtn} onPress={copyStyle}>
              <Text style={st.deleteText}>🖌 העתק סגנון</Text>
            </Pressable>
          )}
          {(selected || imageSelected) && copiedStyle && (
            <Pressable style={st.deleteBtn} onPress={pasteStyle}>
              <Text style={st.deleteText}>🖌 הדבק סגנון</Text>
            </Pressable>
          )}
          <Pressable style={st.graphicsBtn} onPress={() => setGraphicsOpen(true)}>
            <Text style={st.graphicsBtnText}>🖼 גרפיקות</Text>
          </Pressable>
          <Pressable style={st.graphicsBtn} onPress={() => setTemplatesOpen(true)}>
            <Text style={st.graphicsBtnText}>📐 תבניות</Text>
          </Pressable>
          {(layers.length > 0 || localImg) && (
            <Pressable style={st.graphicsBtn} onPress={() => setLayersPanelOpen(true)}>
              <Text style={st.graphicsBtnText}>📚 שכבות</Text>
            </Pressable>
          )}
          <Pressable style={st.graphicsBtn} onPress={pickImage} disabled={uploading}>
            <Text style={st.graphicsBtnText}>{localImg ? '📤 החלפת תמונה' : '📤 העלאת עיצוב'}</Text>
          </Pressable>
          <Pressable style={st.addTextBtn} onPress={addLayer}>
            <Text style={st.addTextBtnText}>+ הוספת טקסט</Text>
          </Pressable>
        </View>


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
          style={[st.nextBtn, (!hasDesign && !localImg || uploading || ordering) && st.nextBtnDisabled]}
          disabled={(!hasDesign && !localImg) || uploading || ordering}
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
                {localImg && !img.hidden && (
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
                          width: `${img.cropScale * 100}%` as any,
                          height: `${img.cropScale * 100}%` as any,
                          left: img.cropOffsetX,
                          top: img.cropOffsetY,
                        },
                      ]}
                      contentFit="contain"
                    />
                  </View>
                )}
                {layers.filter((l) => !l.hidden).map((l) => (
                  <View
                    key={l.id}
                    style={[
                      st.layerWrap,
                      l.width != null && { width: l.width },
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
                        gradientWebStyle(l.gradient),
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

      {/* פאנל גרפיקות — כמו בקנבה: חיפוש + קטגוריות */}
      <Modal visible={graphicsOpen} transparent animationType="slide" onRequestClose={() => setGraphicsOpen(false)}>
        <View style={st.graphicsBackdrop}>
          <View style={st.graphicsSheet}>
            <View style={st.graphicsHeader}>
              <Text style={st.graphicsTitle}>גרפיקות</Text>
              <Pressable onPress={() => setGraphicsOpen(false)} hitSlop={8}>
                <Text style={st.graphicsClose}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              style={st.graphicsSearch}
              value={graphicsQuery}
              onChangeText={setGraphicsQuery}
              placeholder="חיפוש — למשל: לב, כלב, פיצה…"
              placeholderTextColor={C.textDim}
            />
            <ScrollView contentContainerStyle={st.graphicsScroll}>
              {graphicsQuery.trim() ? (
                (() => {
                  const q = graphicsQuery.trim();
                  const matches = GRAPHIC_CATEGORIES.flatMap((cat) =>
                    cat.items.filter(
                      (it) => it.keywords.some((k) => k.includes(q)) || cat.name.includes(q),
                    ),
                  );
                  return matches.length === 0 ? (
                    <Text style={st.graphicsEmpty}>לא נמצאו תוצאות — נסו מילה אחרת</Text>
                  ) : (
                    <View style={st.graphicsGrid}>
                      {matches.map((it, i) => (
                        <Pressable
                          key={it.char + i}
                          style={st.graphicCell}
                          onPress={() => {
                            addSymbol(it.char);
                            setGraphicsOpen(false);
                          }}
                        >
                          <Text style={st.graphicChar}>{it.char}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })()
              ) : (
                GRAPHIC_CATEGORIES.map((cat) => (
                  <View key={cat.name}>
                    <Text style={st.graphicsCatTitle}>{cat.name}</Text>
                    <View style={st.graphicsGrid}>
                      {cat.items.map((it, i) => (
                        <Pressable
                          key={it.char + i}
                          style={st.graphicCell}
                          onPress={() => {
                            addSymbol(it.char);
                            setGraphicsOpen(false);
                          }}
                        >
                          <Text style={st.graphicChar}>{it.char}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* פאנל שכבות — רשימת כל השכבות (תמונה + טקסטים) עם הצג/הסתר, נעילה, והזזה קדימה/אחורה */}
      <Modal visible={layersPanelOpen} transparent animationType="slide" onRequestClose={() => setLayersPanelOpen(false)}>
        <View style={st.graphicsBackdrop}>
          <View style={st.graphicsSheet}>
            <View style={st.graphicsHeader}>
              <Text style={st.graphicsTitle}>שכבות</Text>
              <Pressable onPress={() => setLayersPanelOpen(false)} hitSlop={8}>
                <Text style={st.graphicsClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={st.graphicsScroll}>
              {[...layers].reverse().map((l, revIdx) => {
                const isTop = revIdx === 0;
                const isBottom = revIdx === layers.length - 1;
                return (
                  <View key={l.id} style={[st.layerRow, l.id === selectedId && st.layerRowActive]}>
                    <Pressable
                      style={st.layerRowMain}
                      onPress={() => {
                        setSelectedId(l.id);
                        setImageSelected(false);
                        setLayersPanelOpen(false);
                      }}
                    >
                      <Text style={st.layerRowText} numberOfLines={1}>
                        {l.text.trim() ? l.text.trim().slice(0, 20) : 'טקסט ריק'}
                      </Text>
                    </Pressable>
                    <View style={st.layerRowActions}>
                      <Pressable style={st.toolIconBtn} onPress={() => moveLayerDown(l.id)} disabled={isBottom}>
                        <Text style={[st.toolIconGlyph, isBottom && { opacity: 0.3 }]}>⬇</Text>
                      </Pressable>
                      <Pressable style={st.toolIconBtn} onPress={() => moveLayerUp(l.id)} disabled={isTop}>
                        <Text style={[st.toolIconGlyph, isTop && { opacity: 0.3 }]}>⬆</Text>
                      </Pressable>
                      <Pressable
                        style={[st.toolIconBtn, l.locked && st.btnActive]}
                        onPress={() => setLayers((ls) => ls.map((li) => (li.id === l.id ? { ...li, locked: !li.locked } : li)))}
                      >
                        <Text style={[st.toolIconGlyph, l.locked && st.textActive]}>🔒</Text>
                      </Pressable>
                      <Pressable
                        style={[st.toolIconBtn, l.hidden && st.btnActive]}
                        onPress={() => toggleLayerHidden(l.id)}
                      >
                        <Text style={[st.toolIconGlyph, l.hidden && st.textActive]}>{l.hidden ? '🙈' : '👁'}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {localImg && (
                <View style={[st.layerRow, imageSelected && st.layerRowActive]}>
                  <Pressable
                    style={st.layerRowMain}
                    onPress={() => {
                      setImageSelected(true);
                      setSelectedId(null);
                      setLayersPanelOpen(false);
                    }}
                  >
                    <Text style={st.layerRowText} numberOfLines={1}>🖼 תמונה (תמיד מאחורי הטקסטים)</Text>
                  </Pressable>
                  <View style={st.layerRowActions}>
                    <Pressable
                      style={[st.toolIconBtn, img.locked && st.btnActive]}
                      onPress={() => updateImg({ locked: !img.locked }, false)}
                    >
                      <Text style={[st.toolIconGlyph, img.locked && st.textActive]}>🔒</Text>
                    </Pressable>
                    <Pressable
                      style={[st.toolIconBtn, img.hidden && st.btnActive]}
                      onPress={toggleImgHidden}
                    >
                      <Text style={[st.toolIconGlyph, img.hidden && st.textActive]}>{img.hidden ? '🙈' : '👁'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {layers.length === 0 && !localImg && (
                <Text style={st.graphicsEmpty}>אין עדיין שכבות — הוסיפו טקסט או תמונה</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* פאנל תבניות מוכנות — כל כרטיס מציג תצוגה מוקטנת אמיתית של שכבות התבנית */}
      <Modal visible={templatesOpen} transparent animationType="slide" onRequestClose={() => setTemplatesOpen(false)}>
        <View style={st.graphicsBackdrop}>
          <View style={st.graphicsSheet}>
            <View style={st.graphicsHeader}>
              <Text style={st.graphicsTitle}>תבניות</Text>
              <Pressable onPress={() => setTemplatesOpen(false)} hitSlop={8}>
                <Text style={st.graphicsClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={st.templatesGrid}>
              {TEMPLATES.map((tpl) => {
                const scale = TEMPLATE_THUMB_W / AREA_W;
                const thumbShirt = tpl.shirtHex ?? shirt.hex;
                const thumbLight = colorDistance(thumbShirt, '#ffffff') < colorDistance(thumbShirt, '#000000');
                return (
                  <Pressable key={tpl.id} style={st.templateCard} onPress={() => applyDesignTemplate(tpl)}>
                    <View style={[st.templateThumb, { backgroundColor: thumbShirt }]}>
                      <View
                        style={[
                          st.templateThumbArea,
                          { borderColor: thumbLight ? '#00000022' : '#ffffff22' },
                        ]}
                      >
                        {tpl.layers.map((l, i) => (
                          <Text
                            key={i}
                            style={[
                              {
                                position: 'absolute',
                                left: (l.x ?? AREA_W / 2) * scale,
                                top: (l.y ?? AREA_H / 2) * scale,
                                transform: [
                                  { translateX: '-50%' as never },
                                  { translateY: '-50%' as never },
                                  { rotate: `${l.rotation ?? 0}deg` },
                                ],
                                fontFamily: (l.font ?? FONTS[0]).family,
                                color: l.color ?? '#ffffff',
                                fontSize: Math.max(6, Math.round((l.size ?? 26) * scale)),
                                fontWeight: l.bold ? '700' : 'normal',
                              },
                              gradientWebStyle(l.gradient ?? null),
                            ]}
                            numberOfLines={1}
                          >
                            {l.text}
                          </Text>
                        ))}
                      </View>
                    </View>
                    <Text style={st.templateName}>{tpl.name}</Text>
                  </Pressable>
                );
              })}
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
  graphicsSearch: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.full,
    color: C.text,
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 16,
    textAlign: 'right',
    marginTop: S.md,
    marginBottom: S.sm,
  },
  graphicsScroll: { paddingBottom: S.xl },
  graphicsCatTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: S.md,
    marginBottom: S.sm,
  },
  graphicsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: S.sm },
  graphicCell: {
    width: 56,
    height: 56,
    borderRadius: R.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphicChar: { fontSize: 28 },
  graphicsEmpty: { color: C.textDim, fontSize: 14, textAlign: 'center', marginTop: S.xl },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: S.sm,
  },
  layerRowActive: { borderColor: C.accent },
  layerRowMain: { flex: 1 },
  layerRowText: { color: C.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  layerRowActions: { flexDirection: 'row', gap: 6, marginRight: S.sm },
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
  adviceBox: {
    marginTop: S.sm,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.sm,
  },
  adviceTitle: { color: C.text, fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 4 },
  adviceLine: { color: '#ffd166', fontSize: 12, textAlign: 'right', marginTop: 3 },
  adviceLineOk: { color: C.accent, fontSize: 12, textAlign: 'right', marginTop: 3 },
  adviceFooter: { color: C.textDim, fontSize: 10, textAlign: 'right', marginTop: 6 },
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
  gradientSwatch: {
    minWidth: 64,
    height: 34,
    borderRadius: R.sm,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  gradientSwatchLabel: {
    color: '#00000099',
    fontSize: 11,
    fontWeight: '800',
    textShadowColor: '#ffffffaa',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 0 },
  },
  noneSwatch: { backgroundColor: C.bg },
  noneText: { color: C.textDim, fontSize: 14, fontWeight: '800' },
  templatesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: S.md, paddingBottom: S.xl },
  templateCard: { width: TEMPLATE_THUMB_W, alignItems: 'center' },
  templateThumb: {
    width: TEMPLATE_THUMB_W,
    height: TEMPLATE_THUMB_H,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  templateThumbArea: {
    width: TEMPLATE_THUMB_W - 16,
    height: TEMPLATE_THUMB_H - 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: R.sm,
  },
  templateName: { color: C.text, fontSize: 12, fontWeight: '700', marginTop: 4, textAlign: 'center' },
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
