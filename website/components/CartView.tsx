"use client";

import { useState } from "react";
import Link from "next/link";
import { setQuantity, useCart } from "@/lib/cart-store";
import { CurrencyNote, Money } from "./Money";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";

export function CartView({
  products,
  shipping,
  priceNote,
}: {
  products: Product[];
  shipping: { flatCents: number; freeFromCents: number };
  priceNote: string;
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
      <div className="empty">
        <p className="muted">Your shopping bag is empty.</p>
        <Link className="button" href="/shop/ready-to-wear">
          Continue shopping
        </Link>
      </div>
    );
  }

  const subtotal = lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
  const delivery = subtotal >= shipping.freeFromCents ? 0 : shipping.flatCents;
  const progress = Math.min(1, subtotal / shipping.freeFromCents);

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
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout could not be opened. Please try again.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not be opened. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="bag">
      <ul className="bag-lines">
        {lines.map((l) => (
          <li key={`${l.productId}-${l.variantId}`} className="bag-line">
            <Link href={`/product/${l.product.slug}`} className="frame" aria-label={l.product.name}>
              <ProductImage product={l.product} />
            </Link>
            <div className="bag-line-info">
              <Link className="name" href={`/product/${l.product.slug}`}>
                {l.product.name}
              </Link>
              <span className="muted small">
                {l.product.colour && `${l.product.colour} · `}
                {l.product.variantLabel} {l.variant.label}
              </span>
              <span className="muted small">Delivery in {l.product.deliveryDays}</span>
              <div className="bag-line-actions">
                <span className="qty" aria-label="Quantity">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity(l.productId, l.variantId, l.quantity - 1)}
                  >
                    −
                  </button>
                  <span>{l.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={l.quantity >= 10}
                    onClick={() => setQuantity(l.productId, l.variantId, l.quantity + 1)}
                  >
                    +
                  </button>
                </span>
                <button type="button" className="remove" onClick={() => setQuantity(l.productId, l.variantId, 0)}>
                  Remove
                </button>
              </div>
            </div>
            <span className="price"><Money cents={l.product.priceCents * l.quantity} /></span>
          </li>
        ))}
      </ul>

      <aside className="summary" aria-label="Order summary">
        <span className="label">Order summary</span>
        <div className="progress">
          <span>
            {delivery === 0
              ? "You qualify for complimentary delivery."
              : <>
                <Money cents={shipping.freeFromCents - subtotal} /> away from complimentary delivery.
              </>}
          </span>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <dl>
          <div>
            <dt>Subtotal</dt>
            <dd><Money cents={subtotal} /></dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{delivery === 0 ? "Complimentary" : <Money cents={delivery} />}</dd>
          </div>
          <div className="total">
            <dt>Total</dt>
            <dd><Money cents={subtotal + delivery} /></dd>
          </div>
        </dl>
        <CurrencyNote />
        <p className="fine">{priceNote}. You enter your delivery address and payment details on the next step.</p>
        <button className="button block" type="button" onClick={checkout} disabled={loading}>
          {loading ? "Opening secure checkout…" : "Proceed to checkout"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="fine">
          Secure payment by Stripe: card, TWINT, Apple Pay, Google Pay. Shipped from abroad, see{" "}
          <Link href="/pages/shipping">customs and import charges</Link>.
        </p>
      </aside>
    </div>
  );
}
