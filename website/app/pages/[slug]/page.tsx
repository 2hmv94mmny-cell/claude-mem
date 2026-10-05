import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TextPageLayout } from "@/components/TextPageLayout";
import { pages } from "@/content";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: pages[(await params).slug]?.title ?? "Information" };
}

export default async function TextPage({ params }: Props) {
  const slug = (await params).slug;
  const page = pages[slug];
  if (!page) notFound();
  return (
    <TextPageLayout current={slug} title={page.title}>
      {page.updated && <p className="small">Last updated: {page.updated}</p>}
      {page.sections.map((section, i) => (
        <section key={section.heading ?? i}>
          {section.heading && <h2>{section.heading}</h2>}
          {section.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
    </TextPageLayout>
  );
}
