import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S } from '../../lib/theme';

export default function Account() {
  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Text style={st.title}>החשבון שלי</Text>
      <View style={st.center}>
        <Text style={st.hint}>התחברות, הזמנות וטיוטות — יחוברו בשלב הבא</Text>
        <Pressable
          style={st.waBtn}
          onPress={() => Linking.openURL('https://elronprint.co.il')}
        >
          <Text style={st.waText}>שירות לקוחות</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'right', padding: S.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  hint: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  waBtn: {
    marginTop: S.lg,
    borderWidth: 1.5,
    borderColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 12,
    paddingHorizontal: S.xl,
  },
  waText: { color: C.accent, fontSize: 16, fontWeight: '800' },
});
