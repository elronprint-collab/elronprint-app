import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, S } from '../../lib/theme';

export default function Cart() {
  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Text style={st.title}>העגלה שלי</Text>
      <View style={st.center}>
        <Text style={st.empty}>העגלה ריקה</Text>
        <Text style={st.hint}>מעצבים חולצה בסטודיו או בוחרים מהחנות — והיא תופיע כאן</Text>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'right', padding: S.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  empty: { color: C.text, fontSize: 18, fontWeight: '700' },
  hint: { color: C.textDim, fontSize: 14, textAlign: 'center', marginTop: S.sm, lineHeight: 22 },
});
