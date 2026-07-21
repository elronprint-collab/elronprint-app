import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const APP_WEB_BASE = extra.APP_WEB_BASE || 'https://elronprint-app.vercel.app';

function endpointUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return '/api/ai';
  return `${APP_WEB_BASE}/api/ai`;
}

async function callAi(endpoint: string, payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(endpointUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw new Error('יותר מדי בקשות — נסו שוב בעוד רגע');
    throw new Error(data?.error || 'הפעולה נכשלה, נסו שוב');
  }
  const url = data?.imageUrl;
  if (typeof url !== 'string') throw new Error('לא התקבלה תמונה');
  return url;
}

// שיפור חדות והגדלה — מקבל URL של Cloudinary או fal
export const upscale = (imageUrl: string) => callAi('upscale', { imageUrl });

// הסרת רקע — מקבל URL
export const removeBackground = (imageUrl: string) => callAi('removebg-upload', { imageUrl });

// עיצוב מחדש — מקבל תמונה כ-data URL
export const reimagine = (imageDataUrl: string, note?: string) =>
  callAi('reimagine', { image: imageDataUrl, note: note ?? '' });

// המרת URI מקומי/מרוחק ל-data URL עבור reimagine
export async function toDataUrl(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('קריאת התמונה נכשלה'));
    reader.readAsDataURL(blob);
  });
}
