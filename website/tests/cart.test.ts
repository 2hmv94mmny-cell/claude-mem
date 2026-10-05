import { describe, expect, it } from "vitest";
import { CartError, priceCart, shippingCents } from "../lib/catalog";
import type { Product } from "../lib/types";

const product: Product = {
  id: "p1",
  slug: "p1",
  name: "Loafer",
  category: "shoes",
  silhouette: "loafer",
  colour: "Black",
  priceCents: 5995,
  description: "",
  details: [],
  care: [],
  images: [],
  swatch: "#000",
  variantLabel: "EU size",
  variants: [{ id: "v38", label: "38", supplierVid: "VID" }],
  deliveryDays: "8–15 business days",
  supplier: "cj",
  published: true,
};

describe("priceCart", () => {
  it("uses catalog prices", () => {
    const [line] = priceCart([{ productId: "p1", variantId: "v38", quantity: 2 }], [product]);
    expect(line.lineTotalCents).toBe(11990);
  });

  it("rejects unknown variants, bad quantities and an empty cart", () => {
    expect(() => priceCart([{ productId: "p1", variantId: "nope", quantity: 1 }], [product])).toThrow(CartError);
    expect(() => priceCart([{ productId: "p1", variantId: "v38", quantity: 0 }], [product])).toThrow(CartError);
    expect(() => priceCart([{ productId: "p1", variantId: "v38", quantity: 1.5 }], [product])).toThrow(CartError);
    expect(() => priceCart([{ productId: "p1", variantId: "v38", quantity: 99 }], [product])).toThrow(CartError);
    expect(() => priceCart([], [product])).toThrow(CartError);
  });

  it("blocks example products unless explicitly allowed", () => {
    const example = { ...product, example: true };
    const cart = [{ productId: "p1", variantId: "v38", quantity: 1 }];
    expect(() => priceCart(cart, [example])).toThrow(CartError);
    expect(priceCart(cart, [example], { allowExamples: true })).toHaveLength(1);
  });
});

describe("shippingCents", () => {
  it("costs CHF 6.90 and is free from CHF 80", () => {
    expect(shippingCents(7999)).toBe(690);
    expect(shippingCents(8000)).toBe(0);
  });
});
