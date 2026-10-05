import rawProducts from "../data/products.json";
import type { CartLine, CategoryId, Product } from "./types";

export const categories: { id: CategoryId; name: string; intro: string }[] = [
  { id: "kleidung", name: "Kleidung", intro: "Strick, Blusen, Röcke und Mäntel in den Größen XS bis XL." },
  { id: "taschen", name: "Taschen", intro: "Shopper, Crossbody-Bags und Clutches mit Maßangaben in cm." },
  { id: "schuhe", name: "Schuhe", intro: "Loafer, Stiefeletten, Ballerinas und Sneaker in EU 36 bis 41." },
];

const allProducts = rawProducts as Product[];

export function getProducts(): Product[] {
  return allProducts.filter((p) => p.published);
}

export function getProductsByCategory(category: CategoryId): Product[] {
  return getProducts().filter((p) => p.category === category);
}

export function getProductBySlug(slug: string): Product | undefined {
  return getProducts().find((p) => p.slug === slug);
}

export function getCategory(id: string) {
  return categories.find((c) => c.id === id);
}

export function hasExampleProducts(): boolean {
  return getProducts().some((p) => p.example);
}

export const SHIPPING = {
  flatCents: 495,
  freeFromCents: 6000,
  countries: ["DE", "AT"] as const,
};

export const MAX_QUANTITY_PER_LINE = 10;

export interface PricedLine {
  product: Product;
  variant: Product["variants"][number];
  quantity: number;
  lineTotalCents: number;
}

/**
 * Turns a cart sent by the browser into priced lines, using only catalog prices.
 * Unknown products or variants and invalid quantities are rejected, so a
 * tampered cart can never change what a customer pays.
 */
export function priceCart(
  lines: CartLine[],
  products: Product[] = getProducts(),
  options: { allowExamples?: boolean } = {},
): PricedLine[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new CartError("Der Warenkorb ist leer.");
  return lines.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) throw new CartError("Ein Artikel im Warenkorb ist nicht mehr verfügbar.");
    if (product.example && !options.allowExamples) {
      throw new CartError("Dies ist ein Demo-Shop. Beispielprodukte können noch nicht bestellt werden.");
    }
    const quantity = line.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      throw new CartError(`Bitte wähle eine Menge zwischen 1 und ${MAX_QUANTITY_PER_LINE}.`);
    }
    return { product, variant, quantity, lineTotalCents: product.priceCents * quantity };
  });
}

export function shippingCents(subtotalCents: number): number {
  return subtotalCents >= SHIPPING.freeFromCents ? 0 : SHIPPING.flatCents;
}

export class CartError extends Error {}
