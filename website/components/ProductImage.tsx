import type { Product } from "@/lib/types";

const glyphs: Record<Product["category"], string> = {
  kleidung: "M30 18 L42 12 Q50 20 58 12 L70 18 L78 34 L68 38 L68 86 L32 86 L32 38 L22 34 Z",
  taschen: "M26 40 L74 40 L80 86 L20 86 Z M38 40 Q38 22 50 22 Q62 22 62 40",
  schuhe: "M16 70 L16 56 Q30 56 40 46 L52 52 Q66 60 84 62 Q88 64 88 70 Z",
};

/** Real product photo when available, otherwise a colour tile with a simple outline. */
export function ProductImage({ product, priority = false }: { product: Product; priority?: boolean }) {
  if (product.images[0]) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="product-photo"
        src={product.images[0]}
        alt={product.name}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }
  return (
    <div className="product-photo placeholder" style={{ backgroundColor: product.swatch }} role="img" aria-label={product.name}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d={glyphs[product.category]} />
      </svg>
    </div>
  );
}
