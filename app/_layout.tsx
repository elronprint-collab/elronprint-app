import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager, Platform, View } from 'react-native';
import { CartProvider } from '../lib/cart';
import { C } from '../lib/theme';

// עברית RTL בכל האפליקציה + התאמת גובה לדפדפני מובייל
if (Platform.OS === 'web') {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = 'rtl';
    const style = document.createElement('style');
    style.textContent =
      'html, body, #root { height: 100dvh !important; } body { overscroll-behavior-y: none; }';
    document.head.appendChild(style);
  }
} else if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Heebo: require('../assets/fonts/Heebo.ttf'),
    Rubik: require('../assets/fonts/Rubik.ttf'),
    SecularOne: require('../assets/fonts/SecularOne.ttf'),
    Assistant: require('../assets/fonts/Assistant.ttf'),
    VarelaRound: require('../assets/fonts/VarelaRound.ttf'),
    SuezOne: require('../assets/fonts/SuezOne.ttf'),
    Karantina: require('../assets/fonts/Karantina.ttf'),
    Alef: require('../assets/fonts/Alef.ttf'),
    FrankRuhl: require('../assets/fonts/FrankRuhl.ttf'),
    DavidLibre: require('../assets/fonts/DavidLibre.ttf'),
    MiriamLibre: require('../assets/fonts/MiriamLibre.ttf'),
    NotoHebrew: require('../assets/fonts/NotoHebrew.ttf'),
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  }

  return (
    <CartProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      />
    </CartProvider>
  );
}
