import { Tabs } from 'expo-router';
import { ColorValue, Text } from 'react-native';
import { C } from '../../lib/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => (
  <Text style={{ fontSize: 22, color }}>{glyph}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d0d0d',
          borderTopColor: C.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textDim,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'בית', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="studio" options={{ title: 'סטודיו', tabBarIcon: icon('✦') }} />
      <Tabs.Screen name="shop" options={{ title: 'חנות', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="cart" options={{ title: 'עגלה', tabBarIcon: icon('🛒') }} />
      <Tabs.Screen name="account" options={{ title: 'חשבון', tabBarIcon: icon('◉') }} />
    </Tabs>
  );
}
