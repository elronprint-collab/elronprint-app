// מסיר רקע לבן מקומי — הועבר מהכלי שבאתר: /pages/transparent-tool
// בלי AI ובלי שרת: כל פיקסל קרוב-ללבן הופך שקוף, כל פיקסל אחר נשאר אטום.
// זהה לאלגוריתם שבאתר: whiteness = min(r,g,b), ואז מדרגת אלפא בין lo ל-hi.
import { Platform } from 'react-native';

export const BG_LO_DEFAULT = 235;
export const BG_HI_DEFAULT = 250;
export const BG_LO_MIN = 150;
export const BG_LO_MAX = 253;
export const BG_HI_MIN = 200;
export const BG_HI_MAX = 255;

// העיבוד מבוסס canvas — קיים ב-web (כולל מובייל web). בנייטיב אין canvas.
export const canRemoveWhiteLocally = () =>
  Platform.OS === 'web' && typeof document !== 'undefined';

export type WhiteSource = {
  uri: string;
  maxDim: number;
  w: number;
  h: number;
  data: Uint8ClampedArray;
};

function decode(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('קריאת התמונה נכשלה'));
    img.src = src;
  });
}

// טעינה דרך blob מונעת "tainted canvas" על תמונות מ-Cloudinary.
async function loadImage(uri: string): Promise<HTMLImageElement> {
  if (!/^https?:/i.test(uri)) return decode(uri, false);
  try {
    const res = await fetch(uri, { mode: 'cors' });
    if (!res.ok) throw new Error('fetch failed');
    const objUrl = URL.createObjectURL(await res.blob());
    try {
      return await decode(objUrl, false);
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return decode(uri, true);
  }
}

function ctx2d(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא תומך בעיבוד תמונה');
  return { canvas, ctx };
}

// שלב 1 — פענוח התמונה פעם אחת. התוצאה נשמרת ומשמשת לכל תזוזת סליידר.
export async function prepareWhiteSource(uri: string, maxDim: number): Promise<WhiteSource> {
  const img = await loadImage(uri);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('קריאת התמונה נכשלה');
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const { ctx } = ctx2d(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    throw new Error('לא ניתן לקרוא את התמונה בדפדפן, נסו להעלות אותה מחדש');
  }
  return { uri, maxDim, w, h, data };
}

// שלב 2 — החלת הספים. מהיר (JS טהור), מתאים לתצוגה חיה בזמן גרירת סליידר.
export function applyWhiteThresholds(src: WhiteSource, lo: number, hi: number): string {
  const { w, h, data } = src;
  const outData = new ImageData(w, h);
  const out = outData.data;
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const whiteness = Math.min(r, g, b);
    let alpha: number;
    if (whiteness >= hi) alpha = 0;
    else if (whiteness <= lo) alpha = 255;
    else alpha = Math.round(((hi - whiteness) / span) * 255);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = alpha;
  }
  const { canvas, ctx } = ctx2d(w, h);
  ctx.putImageData(outData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ===== מטה קסם =====
// מסיר רק רקע *מחובר* לשוליים: זוחל פנימה מהקצוות ונעצר כשהצבע מתרחק מצבע הרקע.
// לכן לבן (או כל צבע) שנמצא *בתוך* העיצוב — עין, חור באות — נשאר במקומו.
export const WAND_IN_DEFAULT = 24;
export const WAND_OUT_DEFAULT = 70;
export const WAND_IN_MIN = 0;
export const WAND_IN_MAX = 120;
export const WAND_OUT_MIN = 10;
export const WAND_OUT_MAX = 180;

// זיהוי צבע הרקע: הצבע השכיח ביותר לאורך ארבעת השוליים.
function backgroundRef(data: Uint8ClampedArray, w: number, h: number) {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key);
    if (cur) {
      cur.n++;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  let best = { n: 0, r: 255, g: 255, b: 255 };
  buckets.forEach((v) => {
    if (v.n > best.n) best = v;
  });
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
}

export function applyMagicWand(src: WhiteSource, tolIn: number, tolOut: number): string {
  const { w, h, data } = src;
  const ref = backgroundRef(data, w, h);
  const outer = Math.max(tolIn + 1, tolOut);

  // מרחק צבע מצבע הרקע — ההפרש הגדול מבין שלושת הערוצים
  const dist = (i: number) => {
    const dr = Math.abs(data[i] - ref.r);
    const dg = Math.abs(data[i + 1] - ref.g);
    const db = Math.abs(data[i + 2] - ref.b);
    return dr > dg ? (dr > db ? dr : db) : dg > db ? dg : db;
  };

  const mark = new Uint8Array(w * h); // 1 = רקע מחובר לשוליים
  const inBg = (p: number) => mark[p] === 0 && dist(p * 4) <= outer;

  // מילוי סריקה (scanline) — חוסך זיכרון מול מילוי פיקסל-פיקסל
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (inBg(p)) stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  const scanRow = (x1: number, x2: number, y: number) => {
    let inside = false;
    for (let x = x1; x <= x2; x++) {
      const p = y * w + x;
      if (inBg(p)) {
        if (!inside) {
          stack.push(p);
          inside = true;
        }
      } else {
        inside = false;
      }
    }
  };

  while (stack.length) {
    const p0 = stack.pop() as number;
    if (mark[p0]) continue;
    const y = (p0 / w) | 0;
    const rowStart = y * w;
    let x1 = p0 - rowStart;
    let x2 = x1;
    while (x1 > 0 && inBg(rowStart + x1 - 1)) x1--;
    while (x2 < w - 1 && inBg(rowStart + x2 + 1)) x2++;
    for (let x = x1; x <= x2; x++) mark[rowStart + x] = 1;
    if (y > 0) scanRow(x1, x2, y - 1);
    if (y < h - 1) scanRow(x1, x2, y + 1);
  }

  // שוליים רכים: פיקסל שסומן כרקע אך צבעו כבר מתרחק — נעשה שקוף חלקית בלבד
  const outData = new ImageData(w, h);
  const out = outData.data;
  const span = Math.max(1, outer - tolIn);
  for (let p = 0; p < mark.length; p++) {
    const i = p * 4;
    out[i] = data[i];
    out[i + 1] = data[i + 1];
    out[i + 2] = data[i + 2];
    if (!mark[p]) {
      out[i + 3] = 255;
      continue;
    }
    const d = dist(i);
    out[i + 3] = d <= tolIn ? 0 : Math.round(((d - tolIn) / span) * 255);
  }

  const { canvas, ctx } = ctx2d(w, h);
  ctx.putImageData(outData, 0, 0);
  return canvas.toDataURL('image/png');
}
