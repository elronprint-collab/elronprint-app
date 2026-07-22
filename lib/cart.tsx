import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type DesignLayer = {
  text: string;
  fontFamily: string;
  color: string;
  size: number;
  width?: number;
  x: number;
  y: number;
  rotation: number;
  align: 'right' | 'center' | 'left';
  spacing: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  highlight: string | null;
  outline: boolean;
  opacity: number;
  shadow: boolean;
  lineHeight: number;
  flipH: boolean;
  flipV: boolean;
};

export type CartImageTransform = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  opacity: number;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  borderColor?: string;
  borderWidth?: number;
  cornerRadius?: number;
  cropScale?: number;
  cropOffsetX?: number;
  cropOffsetY?: number;
};

export type CartDesign = {
  shirtHex: string;
  image: string | null;
  imageTransform?: CartImageTransform;
  layers: DesignLayer[];
};

export type CartItem = {
  key: string; // variantId + attributes hash
  variantId: string;
  design?: CartDesign;
  title: string;
  subtitle?: string;
  image: string | null;
  price: number;
  currency: string;
  quantity: number;
  attributes?: { key: string; value: string }[];
};

type CartCtx = {
  items: CartItem[];
  count: number;
  total: number;
  add: (item: Omit<CartItem, 'key'>) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const STORE_KEY = 'epd-cart-v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => raw && setItems(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, loaded]);

  const api = useMemo<CartCtx>(() => {
    const add: CartCtx['add'] = (item) => {
      const key = item.variantId + '|' + JSON.stringify(item.attributes ?? []);
      setItems((prev) => {
        const found = prev.find((i) => i.key === key);
        if (found) {
          return prev.map((i) => (i.key === key ? { ...i, quantity: i.quantity + item.quantity } : i));
        }
        return [...prev, { ...item, key }];
      });
    };
    const setQty: CartCtx['setQty'] = (key, qty) =>
      setItems((prev) =>
        qty <= 0 ? prev.filter((i) => i.key !== key) : prev.map((i) => (i.key === key ? { ...i, quantity: qty } : i)),
      );
    return {
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      total: items.reduce((s, i) => s + i.price * i.quantity, 0),
      add,
      setQty,
      remove: (key) => setQty(key, 0),
      clear: () => setItems([]),
    };
  }, [items]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
