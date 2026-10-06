import Link from "next/link";
import { NewsletterForm } from "@/components/NewsletterForm";
import { ProductCard } from "@/components/ProductCard";
import { Placeholder } from "@/components/ProductImage";
import { categories, getProducts } from "@/lib/catalog";
import { brand, services } from "@/content";
import type { CategoryId, Silhouette } from "@/lib/types";

const categoryArt: Record<CategoryId, { tone: string; silhouette: Silhouette }> = {
  "ready-to-wear": { tone: "#a79d8e", silhouette: "coat" },
  bags: { tone: "#7a4f33", silhouette: "tote" },
  shoes: { tone: "#2a2725", silhouette: "boot" },
  kids: { tone: "#e9e1d4", silhouette: "sweater" },
};

export default function Home() {
  const products = getProducts();
  const arrivals = products.slice(0, 8);

  return (
    <>
      <section className="campaign" aria-labelledby="campaign-title">
        <Placeholder tone="#3b2e25" silhouette="coat" />
        <div className="wrap campaign-copy">
          <span className="label">{brand.season}</span>
          <h1 id="campaign-title">{brand.campaignTitle}</h1>
          <p>{brand.campaignText}</p>
          <div className="cta-row">
            <Link className="cta-link" href="/shop/ready-to-wear">
              Discover the collection
            </Link>
            <Link className="cta-link" href="/shop/bags">
              Shop bags
            </Link>
          </div>
        </div>
      </section>

      <section className="section wrap" aria-label="Collections">
        <div className="triptych">
          {categories.filter((c) => c.id !== "kids").map((c) => (
            <Link key={c.id} href={`/shop/${c.id}`}>
              <div className="frame">
                <Placeholder tone={categoryArt[c.id].tone} silhouette={categoryArt[c.id].silhouette} />
              </div>
              <div className="triptych-caption">
                <h3>{c.name}</h3>
                <span className="cta-link">Shop now</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap" aria-labelledby="arrivals-title">
        <div className="section-head">
          <div>
            <span className="label eyebrow muted">{brand.season}</span>
            <h2 id="arrivals-title">New Arrivals</h2>
          </div>
          <Link className="cta-link" href="/shop/ready-to-wear">
            View all
          </Link>
        </div>
        <div className="grid">
          {arrivals.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="editorial">
          <div className="frame">
            <Placeholder tone="#b59a7a" silhouette="sweater" />
          </div>
          <div className="editorial-copy">
            <span className="label">The Edit</span>
            <h2>{brand.editTitle}</h2>
            <p>{brand.editText}</p>
            <Link className="cta-link" href="/shop/ready-to-wear" style={{ alignSelf: "flex-start" }}>
              Shop the edit
            </Link>
          </div>
        </div>
      </section>

      <section className="wrap" aria-label="Services">
        <dl className="services">
          {services.map((s) => (
            <div key={s.title}>
              <dt className="label">{s.title}</dt>
              <dd>{s.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="section newsletter" style={{ marginTop: "clamp(64px, 9vw, 128px)" }} aria-labelledby="newsletter-title">
        <div className="wrap inner">
          <span className="label">Newsletter</span>
          <h2 id="newsletter-title">Join the House</h2>
          <p>Be the first to discover new collections, private sales and stories from the studio.</p>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
