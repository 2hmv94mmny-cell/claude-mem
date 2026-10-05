import type { Metadata } from "next";
import { Bodoni_Moda, Manrope } from "next/font/google";
import Link from "next/link";
import { CartCount } from "@/components/CartCount";
import { categories, hasExampleProducts } from "@/lib/catalog";
import { company, shop } from "@/content";
import "./globals.css";

// next/font downloads the fonts at build time and serves them from this site,
// so visitors' browsers never contact Google (relevant for the privacy policy).
const display = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["500", "700"],
  style: ["normal", "italic"],
  variable: "--font-display-face",
});
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body-face" });

export const metadata: Metadata = {
  title: { default: shop.name, template: `%s · ${shop.name}` },
  description: shop.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH" className={`${display.variable} ${body.variable}`}>
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
              <p className="muted">{company.email}</p>
            </div>
            <ul className="footer-links">
              <li><Link href="/info/versand">Versand und Lieferzeiten</Link></li>
              <li><Link href="/info/rueckgabe">Rückgabe</Link></li>
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
