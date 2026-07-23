import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const CLOUD = extra.CLOUDINARY_CLOUD || 'dztd5g0p8';
const PRESET = extra.CLOUDINARY_PRESET || 'elronprint';

export async function uploadImage(localUri: string): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // בדפדפן (web) ה-URI המקומי הוא blob:/data: — FormData בדפדפן דורש קובץ/Blob אמיתי,
    // לא את האובייקט {uri,name,type} שעובד רק ב-fetch הנייטיבי של iOS/Android.
    // בלי ההמרה הזו ההעלאה "נשלחת" בלי שגיאה גלויה, אבל cloudUrl אף פעם לא מתקבל בפועל.
    const blob = await (await fetch(localUri)).blob();
    form.append('file', blob, 'design.jpg');
  } else {
    // @ts-expect-error React Native FormData file object
    form.append('file', { uri: localUri, name: 'design.jpg', type: 'image/jpeg' });
  }
  form.append('upload_preset', PRESET);
  form.append('folder', 'elronprint-orders');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('ההעלאה נכשלה, נסו שוב');
  const json = await res.json();
  if (!json.secure_url) throw new Error('ההעלאה נכשלה, נסו שוב');
  return json.secure_url as string;
}

// העלאת תמונה מ-URL מרוחק (למשל תוצאת AI) לשמירה קבועה בענן
export async function uploadRemote(remoteUrl: string): Promise<string> {
  const form = new FormData();
  form.append('file', remoteUrl);
  form.append('upload_preset', PRESET);
  form.append('folder', 'elronprint-orders');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('שמירת התוצאה נכשלה');
  const json = await res.json();
  if (!json.secure_url) throw new Error('שמירת התוצאה נכשלה');
  return json.secure_url as string;
}
