import rawProducts from "../data/products.json";
import type { CartLine, CategoryId, Product } from "./types";

export const categories: { id: CategoryId; name: string; intro: string }[] = [
  { id: "ready-to-wear", name: "Ready-to-Wear", intro: "Knitwear, shirts, tailoring and outerwear in sizes XS to XL." },
  { id: "bags", name: "Bags", intro: "Totes, shoulder bags, crossbodies and evening clutches." },
  { id: "shoes", name: "Shoes", intro: "Loafers, boots, flats and sneakers in EU sizes 36 to 41." },
  { id: "kids", name: "Kids", intro: "Soft knits and little layers, in sizes 66 to 100 (3 months to 3 years)." },
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
  // Amounts in Rappen (1/100 CHF).
  flatCents: 690,
  freeFromCents: 8000,
  countries: ["CH", "LI"] as const,
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
  if (!Array.isArray(lines) || lines.length === 0) throw new CartError("Your bag is empty.");
  return lines.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) throw new CartError("An item in your bag is no longer available.");
    if (product.example && !options.allowExamples) {
      throw new CartError("This is a preview. Sample products cannot be ordered yet.");
    }
    const quantity = line.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      throw new CartError(`Please choose a quantity between 1 and ${MAX_QUANTITY_PER_LINE}.`);
    }
    return { product, variant, quantity, lineTotalCents: product.priceCents * quantity };
  });
}

export function shippingCents(subtotalCents: number): number {
  return subtotalCents >= SHIPPING.freeFromCents ? 0 : SHIPPING.flatCents;
}

export class CartError extends Error {}
