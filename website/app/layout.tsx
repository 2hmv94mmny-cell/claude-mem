import type { Metadata } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";
import Link from "next/link";
import { CartCount } from "@/components/CartCount";
import { categories, hasExampleProducts } from "@/lib/catalog";
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
            <details className="menu label">
              <summary>Menu</summary>
              <nav className="menu-panel" aria-label="Menu">
                {categories.map((c) => (
                  <Link key={c.id} href={`/shop/${c.id}`}>
                    {c.name}
                  </Link>
                ))}
                <Link href="/pages/about">About</Link>
                <Link className="label" href="/pages/contact">
                  Client care
                </Link>
              </nav>
            </details>

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
