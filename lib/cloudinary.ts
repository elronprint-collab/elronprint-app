import Constants from 'expo-constants';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const CLOUD = extra.CLOUDINARY_CLOUD || 'dztd5g0p8';
const PRESET = extra.CLOUDINARY_PRESET || 'elronprint';

const ENDPOINT = `https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`;
const FOLDER = 'elronprint-orders';

export async function uploadImage(localUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    // בדפדפן ה-URI המקומי הוא blob:/data: — FormData בדפדפן דורש קובץ/Blob אמיתי,
    // לא את האובייקט {uri,name,type} שעבד פעם ב-fetch הנייטיבי.
    // בלי ההמרה הזו ההעלאה "נשלחת" בלי שגיאה גלויה, אבל cloudUrl אף פעם לא מתקבל.
    const form = new FormData();
    const blob = await (await fetch(localUri)).blob();
    form.append('file', blob, 'design.jpg');
    form.append('upload_preset', PRESET);
    form.append('folder', FOLDER);
    const res = await fetch(ENDPOINT, { method: 'POST', body: form });
    if (!res.ok) throw new Error('ההעלאה נכשלה, נסו שוב');
    const json = await res.json();
    if (!json.secure_url) throw new Error('ההעלאה נכשלה, נסו שוב');
    return json.secure_url as string;
  }

  // בנייטיב: הארכיטקטורה החדשה של React Native כבר לא מקבלת את האובייקט
  // {uri,name,type} בתוך FormData — היא זורקת "Unsupported FormDataPart implementation".
  // uploadAsync מבצע את ההעלאה בצד הנייטיבי ועוקף את זה לגמרי.
  const res = await uploadAsync(ENDPOINT, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    parameters: { upload_preset: PRESET, folder: FOLDER },
  });
  if (res.status < 200 || res.status >= 300) throw new Error('ההעלאה נכשלה, נסו שוב');
  let json: { secure_url?: string };
  try {
    json = JSON.parse(res.body) as { secure_url?: string };
  } catch {
    throw new Error('ההעלאה נכשלה, נסו שוב');
  }
  if (!json.secure_url) throw new Error('ההעלאה נכשלה, נסו שוב');
  return json.secure_url;
}

// העלאת תמונה מ-URL מרוחק (למשל תוצאת AI, או עיצוב מוכן בנייטיב) לשמירה קבועה בענן.
// כאן אין חלק-קובץ ב-FormData — רק מחרוזות — ולכן זה עובד גם בארכיטקטורה החדשה.
export async function uploadRemote(remoteUrl: string): Promise<string> {
  const form = new FormData();
  form.append('file', remoteUrl);
  form.append('upload_preset', PRESET);
  form.append('folder', FOLDER);
  const res = await fetch(ENDPOINT, { method: 'POST', body: form });
  if (!res.ok) throw new Error('שמירת התוצאה נכשלה');
  const json = await res.json();
  if (!json.secure_url) throw new Error('שמירת התוצאה נכשלה');
  return json.secure_url as string;
}
