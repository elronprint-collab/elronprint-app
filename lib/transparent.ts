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
