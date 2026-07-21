import { Tabs } from 'expo-router';
import { ColorValue, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../lib/cart';
import { C } from '../../lib/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => (
  <Text style={{ fontSize: 22, color }}>{glyph}</Text>
);

function CartIcon({ color }: { color: ColorValue }) {
  const { count } = useCart();
  return (
    <View>
      <Text style={{ fontSize: 22, color }}>🛒</Text>
      {count > 0 && (
        <View style={st.badge}>
          <Text style={st.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d0d0d',
          borderTopColor: C.border,
          height: 56 + bottomPad,
          paddingBottom: bottomPad,
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
      <Tabs.Screen name="cart" options={{ title: 'עגלה', tabBarIcon: (p) => <CartIcon {...p} /> }} />
      <Tabs.Screen name="account" options={{ title: 'חשבון', tabBarIcon: icon('◉') }} />
    </Tabs>
  );
}

const st = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: C.accent,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: C.onAccent, fontSize: 10, fontWeight: '800' },
});
