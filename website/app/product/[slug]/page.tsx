import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/AddToCart";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { SHIPPING, getCategory, getProductBySlug, getProducts, getProductsByCategory } from "@/lib/catalog";
import { formatChf } from "@/lib/money";
import { priceNote } from "@/content";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getProducts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getProductBySlug((await params).slug);
  return { title: product?.name ?? "Product", description: product?.description };
}

export default async function ProductPage({ params }: Props) {
  const product = getProductBySlug((await params).slug);
  if (!product) notFound();
  const category = getCategory(product.category);
  const related = getProductsByCategory(product.category)
    .filter((p) => p.id !== product.id)
    .slice(0, 4);
  const views = Math.max(3, product.images.length);

  return (
    <>
      <div className="wrap">
        <nav className="breadcrumb label" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          {category && <Link href={`/shop/${category.id}`}>{category.name}</Link>}
        </nav>
      </div>

      <section className="wrap pdp">
        <div className="gallery">
          {Array.from({ length: views }, (_, i) => (
            <div key={i} className="frame">
              <ProductImage product={product} view={i} priority={i === 0} />
            </div>
          ))}
        </div>

        <div className="pdp-info">
          <div style={{ display: "grid", gap: 10 }}>
            <h1>{product.name}</h1>
            {product.colour && <span className="muted">{product.colour}</span>}
          </div>
          <div>
            <p className="pdp-price">
              {formatChf(product.priceCents)}
              {product.compareAtCents && <s>{formatChf(product.compareAtCents)}</s>}
            </p>
            <p className="muted small">{priceNote}</p>
          </div>

          <AddToCart product={product} />

          <div className="delivery-line">
            <span>Estimated delivery: {product.deliveryDays}</span>
            <span>
              {formatChf(SHIPPING.flatCents)} delivery, complimentary over {formatChf(SHIPPING.freeFromCents)}.{" "}
              <Link href="/pages/shipping">Customs and import charges</Link>
            </span>
          </div>

          {product.example && <p className="sample-note">Sample piece for the preview. Not yet available to order.</p>}

          <div className="accordion">
            <details open>
              <summary className="label">Description</summary>
              <div className="panel">
                <p>{product.description}</p>
              </div>
            </details>
            <details>
              <summary className="label">Details</summary>
              <div className="panel">
                <ul>
                  {product.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            </details>
            {product.sizeChart && (
              <details>
                <summary className="label">Size and fit</summary>
                <div className="panel">
                  <div className="table-wrap">
                    <table className="size-table">
                      <thead>
                        <tr>
                          {product.sizeChart.head.map((h) => (
                            <th key={h} scope="col">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {product.sizeChart.rows.map((row) => (
                          <tr key={row[0]}>
                            {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {product.sizeChart.note && <p className="small">{product.sizeChart.note}</p>}
                </div>
              </details>
            )}
            {product.care.length > 0 && (
              <details>
                <summary className="label">Care</summary>
                <div className="panel">
                  <ul>
                    {product.care.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
            <details>
              <summary className="label">Delivery and returns</summary>
              <div className="panel">
                <p>
                  Dispatched from our fulfilment partner abroad, with tracking. Unworn pieces with their tags can be
                  returned within 14 days of delivery.
                </p>
                <p>
                  <Link className="cta-link" href="/pages/returns">
                    Returns policy
                  </Link>
                </p>
              </div>
            </details>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="wrap" style={{ paddingBottom: "clamp(64px, 8vw, 120px)" }} aria-labelledby="related-title">
          <div className="section-head">
            <h2 id="related-title">You may also like</h2>
          </div>
          <div className="grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
