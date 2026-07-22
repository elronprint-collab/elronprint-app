# ElronPrint — אפליקציית מובייל

אפליקציית iOS/Android/ווב לחנות elronprint.co.il — Expo (React Native).

## מה יש בגרסה הזאת (v3)
- 5 טאבים RTL בעיצוב המותג, מותאם גם לדפדפני מובייל (סרגל תחתון מלא)
- חנות אמיתית מ-Shopify: קטלוג, דף מוצר עם מידות ותמונות
- עגלה: כמויות, מונה, הנחת-כמות, תשלום מאובטח דרך Shopify Checkout
- סטודיו עיצוב: צבע חולצה, מידה, העלאת תמונה ל-Cloudinary
- כלי טקסט בעברית: 4 פונטים, צבעים, גדלים, מיקום — עם תצוגה חיה 
- כלי AI: הסרת רקע, שיפור חדות, עיצוב מחדש (דרך elronprint-studio-api)
- כל עיצוב מגיע להזמנה ב-Shopify עם הקובץ והפרטים

## מבנה
- app/ — מסכים (expo-router) | api/ai.js — גשר לכלי ה-AI
- lib/ — shopify, cart, cloudinary, ai, theme | assets/fonts — פונטים עבריים
