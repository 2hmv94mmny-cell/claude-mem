import type { Metadata } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";
import Link from "next/link";
import { CartCount } from "@/components/CartCount";
import { CurrencySelect } from "@/components/CurrencySelect";
import { MenuController } from "@/components/MenuController";
import { SearchOverlay } from "@/components/SearchOverlay";
import { categories, getProducts, getProductsByCategory, hasExampleProducts } from "@/lib/catalog";
import { normalize, type SearchItem } from "@/lib/search";
import { announcements, brand, company, footerLinks } from "@/content";
import "./globals.css";

// next/font downloads the fonts at build time and serves them from this site,
// so visitors' browsers never contact Google (relevant for the privacy policy).
const display = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-display-face",
});
const ui = Jost({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-ui-face" });

export const metadata: Metadata = {
  title: { default: `${brand.name} | ${brand.tagline}`, template: `%s | ${brand.name}` },
  description: brand.tagline,
};

const searchItems: SearchItem[] = getProducts().map((p) => {
  const category = categories.find((c) => c.id === p.category)?.name ?? "";
  return {
    slug: p.slug,
    name: p.name,
    colour: p.colour,
    category,
    priceCents: p.priceCents,
    image: p.images[0] ?? null,
    swatch: p.swatch,
    text: normalize([p.name, p.colour, category, p.silhouette, p.description, ...p.details].join(" ")),
  };
});
const searchSuggestions = [
  ...categories.map((c) => ({ href: `/shop/${c.id}`, label: c.name })),
  { href: "/pages/size-guide", label: "Size guide" },
];

const searchIcon = (
  <svg className="search-icon" viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
    <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M13 13 L18 18" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CH" className={`${display.variable} ${ui.variable}`}>
      <body>
        <div className="announce">
          <p>{announcements[0]}</p>
        </div>
        {hasExampleProducts() && (
          <div className="preview-bar" role="note">
            <p>Preview: the pieces shown are samples and cannot be ordered yet.</p>
          </div>
        )}

        <header className="site-header">
          <div className="wrap header-grid">
            <div className="header-left">
              <nav className="nav-desktop label" aria-label="Collections">
                {categories.map((c) => (
                  <Link key={c.id} href={`/shop/${c.id}`}>
                    {c.name}
                  </Link>
                ))}
              </nav>
              <button
                type="button"
                className="menu-toggle label"
                data-menu-open
                aria-controls="site-menu"
                aria-expanded="false"
              >
                <span className="menu-icon" aria-hidden="true" />
                <span className="menu-toggle-text">Menu</span>
              </button>
              <button
                type="button"
                className="search-toggle label"
                data-search-open
                aria-controls="site-search"
                aria-expanded="false"
              >
                {searchIcon}
                <span className="search-toggle-text">Search</span>
              </button>
            </div>

            <Link className="wordmark" href="/" aria-label={`${brand.name}, home`}>
              {brand.name}
            </Link>

            <div className="header-actions label">
              <Link className="only-desktop" href="/pages/contact">
                Client care
              </Link>
              <CurrencySelect className="header-currency" />
              <Link href="/bag" className="bag-link" aria-label="Shopping bag">
                <span className="bag-word">Bag</span>
                <svg className="bag-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                  <path d="M4 6.5h12l-1 11H5z M7.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <CartCount />
              </Link>
            </div>
          </div>
        </header>

        <div id="site-menu" className="menu-overlay" role="dialog" aria-modal="true" aria-label="Menu" hidden>
          <div className="wrap menu-top">
            <button type="button" className="label menu-close" data-menu-close>
              Close
            </button>
            <Link className="wordmark" href="/">
              {brand.name}
            </Link>
            <Link className="label menu-bag" href="/bag">
              Bag <CartCount />
            </Link>
          </div>
          <nav className="wrap menu-links" aria-label="Collections">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop/${c.id}`}>
                <span className="menu-link-name">{c.name}</span>
                <span className="menu-link-meta label">
                  {getProductsByCategory(c.id).length} {getProductsByCategory(c.id).length === 1 ? "piece" : "pieces"}
                </span>
              </Link>
            ))}
            <Link href="/pages/about">
              <span className="menu-link-name">The House</span>
              <span className="menu-link-meta label">About</span>
            </Link>
          </nav>
          <div className="wrap menu-foot">
            <div className="menu-service">
              <Link href="/pages/contact">Client care</Link>
              <Link href="/pages/shipping">Shipping</Link>
              <Link href="/pages/returns">Returns</Link>
              <Link href="/pages/size-guide">Size guide</Link>
            </div>
            <div className="menu-currency">
              <span className="label muted">Delivered worldwide · Currency</span>
              <CurrencySelect />
            </div>
          </div>
        </div>
        <MenuController />
        <SearchOverlay items={searchItems} suggestions={searchSuggestions} />

        <main>{children}</main>

        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div className="footer-brand">
              <p>{brand.tagline}. Designed in Switzerland, delivered worldwide.</p>
            </div>
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="label">{title}</h3>
                <ul>
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="footer-giant" aria-hidden="true">
            {brand.name}
          </div>
          <div className="footer-bottom">
            <div className="wrap" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
              <span>
                © {new Date().getFullYear()} {company.legalName}
              </span>
              <span className="footer-currency">
                Delivered worldwide · <CurrencySelect />
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
