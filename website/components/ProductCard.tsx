import Link from "next/link";
import { formatChf } from "@/lib/money";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link className="product-card" href={`/product/${product.slug}`} aria-label={`${product.name}, ${formatChf(product.priceCents)}`}>
      <div className="frame">
        <ProductImage product={product} view={0} />
        <ProductImage product={product} view={1} className="alt" />
      </div>
      <div className="product-card-info">
        <span className="name">{product.name}</span>
        {product.colour && <span className="colour">{product.colour}</span>}
        <span className="price">
          {formatChf(product.priceCents)}
          {product.compareAtCents && <s>{formatChf(product.compareAtCents)}</s>}
        </span>
      </div>
    </Link>
  );
}
