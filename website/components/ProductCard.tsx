import Link from "next/link";
import { formatChf } from "@/lib/money";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link className="product-card" href={`/produkt/${product.slug}`}>
      <ProductImage product={product} />
      <div className="product-card-body">
        <h3>{product.name}</h3>
        <p className="price-line">
          <span>{formatChf(product.priceCents)}</span>
          {product.compareAtCents && <s className="muted">{formatChf(product.compareAtCents)}</s>}
        </p>
      </div>
    </Link>
  );
}
