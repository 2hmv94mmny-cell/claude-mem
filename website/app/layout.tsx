import type { Metadata } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";
import Link from "next/link";
import { CartCount } from "@/components/CartCount";
import { MenuController } from "@/components/MenuController";
import { categories, getProductsByCategory, hasExampleProducts } from "@/lib/catalog";
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
              Menu
            </button>

            <Link className="wordmark" href="/" aria-label={`${brand.name}, home`}>
              {brand.name}
            </Link>

            <div className="header-actions label">
              <Link className="only-desktop" href="/pages/contact">
                Client care
              </Link>
              <Link href="/bag">
                Bag <CartCount />
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
            <p className="label muted">Switzerland · CHF</p>
          </div>
        </div>
        <MenuController />

        <main>{children}</main>

        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div className="footer-brand">
              <p>{brand.tagline}. Delivered across Switzerland and Liechtenstein.</p>
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
              <span>Switzerland · CHF</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
