import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/AddToCart";
import { ProductImage } from "@/components/ProductImage";
import { SHIPPING, getCategory, getProductBySlug, getProducts } from "@/lib/catalog";
import { formatEuro } from "@/lib/money";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getProducts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getProductBySlug((await params).slug);
  return { title: product?.name ?? "Produkt", description: product?.description };
}

export default async function ProductPage({ params }: Props) {
  const product = getProductBySlug((await params).slug);
  if (!product) notFound();
  const category = getCategory(product.category);

  return (
    <section className="wrap section product-layout">
      <div className="product-gallery">
        <ProductImage product={product} priority />
      </div>
      <div className="product-info">
        {category && (
          <Link className="eyebrow" href={`/shop/${category.id}`}>
            {category.name}
          </Link>
        )}
        <h1>{product.name}</h1>
        <p className="product-price">
          <span>{formatEuro(product.priceCents)}</span>
          {product.compareAtCents && <s className="muted">{formatEuro(product.compareAtCents)}</s>}
        </p>
        <p className="muted small">
          inkl. MwSt., zzgl. <Link href="/info/versand">Versand</Link> ({formatEuro(SHIPPING.flatCents)}, ab{" "}
          {formatEuro(SHIPPING.freeFromCents)} kostenlos)
        </p>
        <p>{product.description}</p>
        <AddToCart product={product} />
        <p className="delivery">Lieferzeit: {product.deliveryDays}</p>
        <ul className="details">
          {product.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        {product.example && <p className="example-note">Beispielprodukt – noch nicht mit einem Lieferanten verknüpft.</p>}
      </div>
    </section>
  );
}
