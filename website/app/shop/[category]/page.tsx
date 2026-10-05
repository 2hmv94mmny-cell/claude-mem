import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import { categories, getCategory, getProductsByCategory } from "@/lib/catalog";

type Props = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getCategory((await params).category);
  return { title: category?.name ?? "Shop" };
}

export default async function CategoryPage({ params }: Props) {
  const category = getCategory((await params).category);
  if (!category) notFound();
  const products = getProductsByCategory(category.id);

  return (
    <section className="wrap section">
      <div className="section-head stacked">
        <h1 className="page-title">{category.name}</h1>
        <p className="muted">{category.intro}</p>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <p>In dieser Kategorie gibt es gerade keine Artikel.</p>
      )}
    </section>
  );
}
