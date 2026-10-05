import Link from "next/link";

const nav = [
  { slug: "contact", label: "Client care" },
  { slug: "shipping", label: "Shipping" },
  { slug: "returns", label: "Returns" },
  { slug: "size-guide", label: "Size guide" },
  { slug: "about", label: "About" },
  { slug: "terms", label: "Terms and conditions" },
  { slug: "privacy", label: "Privacy policy" },
  { slug: "imprint", label: "Imprint" },
];

export function TextPageLayout({
  current,
  title,
  children,
}: {
  current: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="wrap text-page">
      <nav className="text-nav" aria-label="Information">
        {nav.map((item) => (
          <Link key={item.slug} href={`/pages/${item.slug}`} aria-current={item.slug === current ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      <article className="text-body">
        <h1>{title}</h1>
        {children}
      </article>
    </div>
  );
}
