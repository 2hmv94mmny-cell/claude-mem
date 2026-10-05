import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap success">
      <span className="label muted">404</span>
      <h1>Page not found</h1>
      <p className="muted">This page does not exist, or the piece is no longer available.</p>
      <Link className="button" href="/">
        Return home
      </Link>
    </section>
  );
}
