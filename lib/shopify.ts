import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const DOMAIN = extra.SHOPIFY_DOMAIN || 'elronprint.co.il';
const TOKEN = extra.SHOPIFY_STOREFRONT_TOKEN || '';
const API_VERSION = '2025-07';

export const isConfigured = () => TOKEN.length > 0;

export type Product = {
  id: string;
  handle: string;
  title: string;
  image: string | null;
  price: string;
  currency: string;
};

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': TOKEN,
      'Accept-Language': 'he',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

export async function fetchProducts(first = 20): Promise<Product[]> {
  type Resp = {
    products: {
      edges: {
        node: {
          id: string;
          handle: string;
          title: string;
          featuredImage: { url: string } | null;
          priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
        };
      }[];
    };
  };
  const data = await gql<Resp>(
    `query ($first: Int!) {
      products(first: $first, sortKey: BEST_SELLING) {
        edges { node {
          id handle title
          featuredImage { url }
          priceRange { minVariantPrice { amount currencyCode } }
        } }
      }
    }`,
    { first },
  );
  return data.products.edges.map(({ node }) => ({
    id: node.id,
    handle: node.handle,
    title: node.title,
    image: node.featuredImage?.url ?? null,
    price: Number(node.priceRange.minVariantPrice.amount).toFixed(0),
    currency: node.priceRange.minVariantPrice.currencyCode === 'ILS' ? '₪' : node.priceRange.minVariantPrice.currencyCode,
  }));
}

// עגלה — Storefront Cart API. יצירת עגלה מחזירה checkoutUrl של Shopify.
export type CartLine = { merchandiseId: string; quantity: number; attributes?: { key: string; value: string }[] };

export async function createCart(lines: CartLine[]): Promise<{ id: string; checkoutUrl: string }> {
  type Resp = { cartCreate: { cart: { id: string; checkoutUrl: string } } };
  const data = await gql<Resp>(
    `mutation ($lines: [CartLineInput!]!) {
      cartCreate(input: { lines: $lines }) { cart { id checkoutUrl } }
    }`,
    { lines },
  );
  return data.cartCreate.cart;
}
