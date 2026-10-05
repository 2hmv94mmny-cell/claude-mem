import type { CSSProperties } from "react";
import type { Product, Silhouette } from "@/lib/types";

// Fine line drawings used on placeholder images until real product photography exists.
const outlines: Record<Silhouette, string> = {
  sweater:
    "M34 22 Q50 30 66 22 L82 30 L90 64 L80 66 L74 44 L74 84 Q50 88 26 84 L26 44 L20 66 L10 64 L18 30 Z M40 23 Q50 33 60 23 M26 78 Q50 82 74 78",
  coat: "M38 10 L50 22 L62 10 L76 16 L84 60 L76 62 L72 34 L72 92 L28 92 L28 34 L24 62 L16 60 L24 16 Z M50 22 L45 92 M50 22 L57 52 M28 54 L72 54 M58 60 L60 66",
  skirt: "M36 16 L64 16 L66 25 L82 86 Q50 92 18 86 L34 25 Z M34 25 L66 25 M45 25 L41 89 M55 25 L59 89",
  shirt:
    "M36 14 L44 12 L50 21 L56 12 L64 14 L80 24 L86 58 L78 60 L72 38 L72 88 L28 88 L28 38 L22 60 L14 58 L20 24 Z M50 21 L50 88 M58 32 L66 32 L66 40 L58 40 Z",
  trousers: "M30 10 L70 10 L77 90 L58 90 L50 32 L42 90 L23 90 Z M30 18 L70 18 M40 18 L41 30 M60 18 L59 30",
  tote: "M20 42 L80 42 L75 88 L25 88 Z M36 42 Q36 18 50 18 Q64 18 64 42 M20 54 L80 54 M47 54 L53 54 L53 60 L47 60 Z",
  crossbody:
    "M28 58 L72 58 L72 84 Q72 88 68 88 L32 88 Q28 88 28 84 Z M28 68 L72 68 M47 68 L53 68 L53 74 L47 74 Z M30 58 L48 12 M70 58 L52 12",
  shoulder:
    "M22 48 Q22 40 30 40 L70 40 Q78 40 78 48 L78 80 Q78 88 70 88 L30 88 Q22 88 22 80 Z M32 40 Q50 4 68 40 M34 52 L66 78 M66 52 L34 78 M22 64 L78 64",
  clutch: "M14 46 L86 46 L86 74 L14 74 Z M14 46 L50 63 L86 46 M47 61 L53 61 L53 67 L47 67 Z",
  loafer:
    "M10 70 L12 58 Q28 56 40 47 L58 49 Q74 53 86 60 Q91 64 89 70 Z M40 47 Q42 58 58 58 Q63 52 58 49 M10 74 L89 74 M80 70 L82 74 M46 56 Q50 60 54 56",
  boot: "M37 10 L57 10 Q56 32 58 48 Q62 56 74 60 Q87 64 88 71 Q88 76 82 76 L47 76 L45 87 L38 87 Q34 60 37 10 Z M57 16 L57 44 M38 76 L47 76 M37 30 Q47 32 57 30",
  flat: "M8 68 Q28 66 44 56 Q58 48 72 55 Q84 61 92 59 L90 66 Q72 71 60 71 L18 72 Z M72 58 L74 82 L77 82 L76 64 M22 66 Q40 60 54 54",
  sneaker:
    "M10 62 L12 48 Q24 48 34 38 L50 42 Q64 48 84 52 Q91 54 91 62 Z M10 62 L10 72 L91 72 L91 62 M36 42 L40 52 M42 44 L46 54 M48 46 L52 56 M10 66 L91 66",
};

function isDark(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

// Each view uses a different light position and crop, so a gallery reads like a shoot.
const views = [
  { lx: "50%", ly: "34%", size: "52%" },
  { lx: "28%", ly: "26%", size: "78%" },
  { lx: "70%", ly: "60%", size: "36%" },
];

export function Placeholder({
  tone,
  silhouette,
  view = 0,
  className = "",
}: {
  tone: string;
  silhouette: Silhouette;
  view?: number;
  className?: string;
}) {
  const v = views[view % views.length];
  const style = { "--tone": tone, "--lx": v.lx, "--ly": v.ly, "--size": v.size } as CSSProperties;
  return (
    <div className={`ph ${isDark(tone) ? "on-dark" : "on-light"} ${className}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <path d={outlines[silhouette]} />
      </svg>
    </div>
  );
}

/** A product view: real photo when available, otherwise a studio-style placeholder. */
export function ProductImage({
  product,
  view = 0,
  className = "",
  priority = false,
}: {
  product: Product;
  view?: number;
  className?: string;
  priority?: boolean;
}) {
  const src = product.images[view];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={className} src={src} alt={`${product.name}, view ${view + 1}`} loading={priority ? "eager" : "lazy"} />
    );
  }
  return <Placeholder tone={product.swatch} silhouette={product.silhouette} view={view} className={className} />;
}
