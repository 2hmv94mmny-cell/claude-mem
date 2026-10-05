import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import { categories, getCategory, getProductsByCategory } from "@/lib/catalog";

type Props = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getCategory((await params).category);
  return { title: category?.name ?? "Shop", description: category?.intro };
}

export default async function CategoryPage({ params }: Props) {
  const category = getCategory((await params).category);
  if (!category) notFound();
  const products = getProductsByCategory(category.id);

  return (
    <>
      <header className="wrap collection-head">
        <span className="label muted">Collection</span>
        <h1>{category.name}</h1>
        <p>{category.intro}</p>
      </header>
      <section className="wrap" style={{ paddingBottom: "clamp(64px, 8vw, 120px)" }}>
        <div className="collection-bar label">
          <nav className="collection-tabs" aria-label="Collections">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop/${c.id}`} aria-current={c.id === category.id ? "page" : undefined}>
                {c.name}
              </Link>
            ))}
          </nav>
          <span className="muted">
            {products.length} {products.length === 1 ? "piece" : "pieces"}
          </span>
        </div>
        {products.length ? (
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <p className="muted">New pieces are arriving soon.</p>
        )}
      </section>
    </>
  );
}
