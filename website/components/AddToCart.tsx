"use client";

import { useState } from "react";
import Link from "next/link";
import { addToCart } from "@/lib/cart-store";
import type { Product } from "@/lib/types";

export function AddToCart({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState<string | null>(
    product.variants.length === 1 ? product.variants[0].id : null,
  );
  const [added, setAdded] = useState(false);
  const isSize = product.category !== "bags";

  function add() {
    if (!variantId) return;
    addToCart(product.id, variantId, 1);
    setAdded(true);
  }

  return (
    <div className="buy">
      <div className="option-head">
        <span className="label">Select {product.variantLabel.toLowerCase()}</span>
        {isSize && <Link href="/pages/size-guide">Size guide</Link>}
      </div>
      <fieldset className="options">
        <legend>Select {product.variantLabel}</legend>
        {product.variants.map((v) => (
          <label key={v.id} className={v.id === variantId ? "option selected" : "option"}>
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
      </fieldset>
      <button className="button block" type="button" onClick={add} disabled={!variantId}>
        {variantId ? "Add to bag" : `Select a ${product.variantLabel.toLowerCase()}`}
      </button>
      {added && (
        <div className="added" role="status">
          <span>Added to your bag</span>
          <Link className="cta-link" href="/bag">
            View bag
          </Link>
        </div>
      )}
    </div>
  );
}
