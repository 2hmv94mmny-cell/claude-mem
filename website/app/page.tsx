import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { categories, getProducts, getProductsByCategory } from "@/lib/catalog";
import { promises, shop } from "@/content";

export default function Home() {
  const products = getProducts();
  const featured = products.filter((p) => p.compareAtCents).slice(0, 4);
  const newIn = products.slice(0, 8);

  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">Neue Saison · Herbst</p>
          <h1>{shop.tagline}</h1>
          <p className="lead">{shop.intro}</p>
          <div className="actions">
            <Link className="button button-primary" href="/shop/kleidung">
              Kleidung ansehen
            </Link>
            <Link className="button button-ghost" href="/shop/taschen">
              Taschen
            </Link>
          </div>
        </div>
        <div className="hero-mosaic" aria-hidden="true">
          {featured.slice(0, 3).map((p) => (
            <div key={p.id} className="mosaic-tile">
              <ProductImage product={p} priority />
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <ul className="category-strip">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/shop/${c.id}`} className="category-link">
                <span className="category-name">{c.name}</span>
                <span className="muted">{getProductsByCategory(c.id).length} Artikel</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Neu im Shop</h2>
          <Link href="/shop/kleidung" className="text-link">
            Alle ansehen
          </Link>
        </div>
        <div className="product-grid">
          {newIn.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="wrap section">
        <dl className="promises">
          {promises.map((item) => (
            <div key={item.title}>
              <dt>{item.title}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
