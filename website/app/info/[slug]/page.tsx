import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { legalPages } from "@/content";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(legalPages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: legalPages[(await params).slug]?.title ?? "Info" };
}

export default async function InfoPage({ params }: Props) {
  const page = legalPages[(await params).slug];
  if (!page) notFound();
  return (
    <section className="wrap section narrow prose">
      <h1 className="page-title">{page.title}</h1>
      {page.body.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </section>
  );
}
