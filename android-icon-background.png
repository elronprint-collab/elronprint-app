import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchProducts, isConfigured, Product } from '../../lib/shopify';
import { C, R, S } from '../../lib/theme';

export default function Shop() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setProducts(await fetchProducts(20));
    } catch {
      setError('לא הצלחנו לטעון את המוצרים. משכו לרענון או נסו שוב מאוחר יותר.');
      setProducts([]);
    }
  }

  useEffect(() => {
    if (isConfigured()) load();
  }, []);

  if (!isConfigured()) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <View style={st.center}>
          <Text style={st.setupTitle}>החנות עוד לא מחוברת</Text>
          <Text style={st.setupText}>
            נדרש טוקן Storefront API מ-Shopify.{'\n'}נוסיף אותו בשלב החיבור.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <Text style={st.title}>החנות</Text>
      {products === null ? (
        <View style={st.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: S.sm, paddingHorizontal: S.md }}
          contentContainerStyle={{ gap: S.sm, paddingBottom: S.xl }}
          refreshing={false}
          onRefresh={load}
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={st.setupText}>{error ?? 'אין מוצרים להצגה'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={st.card} onPress={() => router.push(`/product/${item.handle}`)}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={st.cardImg} contentFit="cover" />
              ) : (
                <View style={[st.cardImg, st.noImg]} />
              )}
              <Text style={st.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={st.cardPrice}>
                {item.currency}
                {item.price}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'right',
    padding: S.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  setupTitle: { color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  setupText: {
    color: C.textDim,
    fontSize: 14,
    textAlign: 'center',
    marginTop: S.sm,
    lineHeight: 22,
  },
  card: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    paddingBottom: S.sm,
  },
  cardImg: { width: '100%', aspectRatio: 1 },
  noImg: { backgroundColor: C.surfaceHi },
  cardTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    paddingHorizontal: S.sm,
    marginTop: S.sm,
  },
  cardPrice: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    paddingHorizontal: S.sm,
    marginTop: 4,
  },
});
