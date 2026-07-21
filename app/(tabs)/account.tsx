import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S } from '../../lib/theme';

const WHATSAPP = 'https://wa.me/972545998990';
const SITE = 'https://elronprint.co.il';

export default function Account() {
  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Text style={st.title}>החשבון שלי</Text>
      <View style={st.center}>
        <Text style={st.hint}>התחברות, הזמנות וטיוטות — יחוברו בשלב הבא</Text>

        <Pressable style={st.waBtn} onPress={() => Linking.openURL(WHATSAPP)}>
          <Text style={st.waText}>💬 שירות לקוחות בוואטסאפ</Text>
        </Pressable>

        <Pressable style={st.siteBtn} onPress={() => Linking.openURL(SITE)}>
          <Text style={st.siteText}>לאתר elronprint.co.il</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'right', padding: S.md },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: S.md,
  },
  homeBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: R.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  homeText: { color: C.text, fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  hint: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  waBtn: {
    marginTop: S.lg,
    backgroundColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 14,
    paddingHorizontal: S.xl,
  },
  waText: { color: C.onAccent, fontSize: 16, fontWeight: '800' },
  siteBtn: {
    marginTop: S.md,
    borderWidth: 1.5,
    borderColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 12,
    paddingHorizontal: S.xl,
  },
  siteText: { color: C.accent, fontSize: 15, fontWeight: '800' },
});
