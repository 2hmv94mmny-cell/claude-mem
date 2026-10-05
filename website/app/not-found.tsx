import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap section narrow">
      <h1 className="page-title">Seite nicht gefunden</h1>
      <p>Diese Seite gibt es nicht oder der Artikel ist nicht mehr verfügbar.</p>
      <Link className="button button-primary" href="/">
        Zur Startseite
      </Link>
    </section>
  );
}
