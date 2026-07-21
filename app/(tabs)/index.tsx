import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S } from '../../lib/theme';

const CATEGORIES = [
  'חולצות לחתונה',
  'מסיבת רווקות',
  'ימי הולדת',
  'אירועי חברה',
  'משפחות',
  'עיצובים מוכנים',
];

export default function Home() {
  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.scroll}>
        <View style={st.header}>
          <Text style={st.logo}>
            Elron<Text style={{ color: C.accent }}>Print</Text>
          </Text>
        </View>

        <View style={st.hero}>
          <Text style={st.heroTitle}>מעצבים חולצה{'\n'}בדקות מהטלפון</Text>
          <Text style={st.heroSub}>הדפסה איכותית · משלוח לכל הארץ · הנחות כמות</Text>
          <Link href="/studio" asChild>
            <Pressable style={st.cta}>
              <Text style={st.ctaText}>מתחילים לעצב ←</Text>
            </Pressable>
          </Link>
        </View>

        <Text style={st.sectionTitle}>קטגוריות</Text>
        <View style={st.grid}>
          {CATEGORIES.map((c) => (
            <Link key={c} href="/shop" asChild>
              <Pressable style={st.catCard}>
                <Text style={st.catText}>{c}</Text>
              </Pressable>
            </Link>
          ))}
        </View>

        <View style={st.bulkBanner}>
          <Text style={st.bulkTitle}>מזמינים בכמות — חוסכים</Text>
          <Text style={st.bulkText}>הנחה אוטומטית מ-11 פריטים, והנחה מוגדלת מ-51</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: S.xl },
  header: { paddingHorizontal: S.md, paddingVertical: S.sm },
  logo: { color: C.text, fontSize: 26, fontWeight: '800', textAlign: 'left' },
  hero: {
    margin: S.md,
    padding: S.lg,
    borderRadius: R.lg,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroTitle: { color: C.text, fontSize: 30, fontWeight: '800', lineHeight: 38, textAlign: 'right' },
  heroSub: { color: C.textDim, fontSize: 14, marginTop: S.sm, textAlign: 'right' },
  cta: {
    marginTop: S.lg,
    backgroundColor: C.accent,
    borderRadius: R.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: { color: C.onAccent, fontSize: 17, fontWeight: '800' },
  sectionTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: '700',
    marginHorizontal: S.md,
    marginTop: S.sm,
    textAlign: 'right',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: S.md - S.xs,
    marginTop: S.sm,
  },
  catCard: {
    width: '46%',
    margin: '2%',
    paddingVertical: S.lg,
    borderRadius: R.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  catText: { color: C.text, fontSize: 15, fontWeight: '600' },
  bulkBanner: {
    margin: S.md,
    padding: S.md,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.accent,
  },
  bulkTitle: { color: C.accent, fontSize: 16, fontWeight: '800', textAlign: 'right' },
  bulkText: { color: C.textDim, fontSize: 13, marginTop: 4, textAlign: 'right' },
});
