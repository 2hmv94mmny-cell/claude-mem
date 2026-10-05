"use client";

import { useState } from "react";
import Link from "next/link";
import { setQuantity, useCart } from "@/lib/cart-store";
import { formatChf } from "@/lib/money";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";

export function CartView({
  products,
  shipping,
}: {
  products: Product[];
  shipping: { flatCents: number; freeFromCents: number };
}) {
  const cart = useCart();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lines = cart.flatMap((line) => {
    const product = products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    return product && variant ? [{ ...line, product, variant }] : [];
  });

  if (lines.length === 0) {
    return (
      <div className="empty-cart">
        <p>Dein Warenkorb ist leer.</p>
        <Link className="button button-primary" href="/">
          Weiter einkaufen
        </Link>
      </div>
    );
  }

  const subtotal = lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
  const shippingCost = subtotal >= shipping.freeFromCents ? 0 : shipping.flatCents;

  async function checkout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Die Kasse konnte nicht geöffnet werden.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Kasse konnte nicht geöffnet werden.");
      setLoading(false);
    }
  }

  return (
    <div className="cart-layout">
      <ul className="cart-lines">
        {lines.map((l) => (
          <li key={`${l.productId}-${l.variantId}`} className="cart-line">
            <ProductImage product={l.product} />
            <div className="cart-line-info">
              <Link href={`/produkt/${l.product.slug}`}>{l.product.name}</Link>
              <span className="muted">
                {l.product.variantLabel}: {l.variant.label}
              </span>
              <label className="qty">
                Menge
                <select
                  id={`qty-${l.productId}-${l.variantId}`}
                  value={l.quantity}
                  onChange={(e) => setQuantity(l.productId, l.variantId, Number(e.target.value))}
                >
                  {Array.from({ length: 11 }, (_, n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Entfernen" : n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="cart-line-price">{formatChf(l.product.priceCents * l.quantity)}</span>
          </li>
        ))}
      </ul>

      <aside className="summary">
        <dl>
          <div>
            <dt>Zwischensumme</dt>
            <dd>{formatChf(subtotal)}</dd>
          </div>
          <div>
            <dt>Versand</dt>
            <dd>{shippingCost === 0 ? "kostenlos" : formatChf(shippingCost)}</dd>
          </div>
          <div className="summary-total">
            <dt>Gesamt</dt>
            <dd>{formatChf(subtotal + shippingCost)}</dd>
          </div>
        </dl>
        <p className="muted small">
          Endpreise in CHF. Lieferadresse und Zahlung gibst du im nächsten Schritt an.{" "}
          <Link href="/info/versand">Hinweis zu Zoll und Einfuhrabgaben</Link>
        </p>
        {shippingCost > 0 && (
          <p className="small">Noch {formatChf(shipping.freeFromCents - subtotal)} bis zum kostenlosen Versand.</p>
        )}
        <button className="button button-primary wide" type="button" onClick={checkout} disabled={loading}>
          {loading ? "Kasse wird geöffnet …" : "Zur Kasse"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}
