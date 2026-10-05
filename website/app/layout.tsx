import type { Metadata } from "next";
import Link from "next/link";
import { CartCount } from "@/components/CartCount";
import { categories, hasExampleProducts } from "@/lib/catalog";
import { shop } from "@/content";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: shop.name, template: `%s · ${shop.name}` },
  description: shop.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;0,6..96,700;1,6..96,500&family=Manrope:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {hasExampleProducts() && (
          <p className="demo-bar" role="note">
            Demo-Shop: Die Produkte sind Beispiele und noch nicht bestellbar.
          </p>
        )}
        <header className="site-header">
          <div className="wrap header-row">
            <Link className="brand" href="/">
              {shop.name}
            </Link>
            <nav aria-label="Kategorien">
              <ul className="nav-list">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link href={`/shop/${c.id}`}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <Link className="cart-link" href="/warenkorb">
              Warenkorb <CartCount />
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div>
              <p className="footer-brand">{shop.name}</p>
              <p className="muted">{shop.email}</p>
            </div>
            <ul className="footer-links">
              <li><Link href="/info/versand">Versand und Lieferzeiten</Link></li>
              <li><Link href="/info/widerruf">Widerrufsbelehrung</Link></li>
              <li><Link href="/info/agb">AGB</Link></li>
              <li><Link href="/info/datenschutz">Datenschutz</Link></li>
              <li><Link href="/info/impressum">Impressum</Link></li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
