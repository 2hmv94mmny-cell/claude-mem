"use client";

import { useState } from "react";
import Link from "next/link";
import { addToCart } from "@/lib/cart-store";
import type { Product } from "@/lib/types";

export function AddToCart({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  function add() {
    if (!variantId) return;
    addToCart(product.id, variantId, 1);
    setAdded(true);
  }

  return (
    <div className="buy-box">
      <fieldset className="variant-picker">
        <legend>{product.variantLabel} wählen</legend>
        <div className="variant-options">
          {product.variants.map((v) => (
            <label key={v.id} className={v.id === variantId ? "variant selected" : "variant"}>
              <input
                type="radio"
                name="variant"
                value={v.id}
                checked={v.id === variantId}
                onChange={() => {
                  setVariantId(v.id);
                  setAdded(false);
                }}
              />
              {v.label}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="button button-primary" type="button" onClick={add} disabled={!variantId}>
        {variantId ? "In den Warenkorb" : `Bitte ${product.variantLabel} wählen`}
      </button>
      {added && (
        <p className="added-note" role="status">
          Hinzugefügt. <Link href="/warenkorb">Zum Warenkorb</Link>
        </p>
      )}
    </div>
  );
}
