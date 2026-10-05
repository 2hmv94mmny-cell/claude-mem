import type { Metadata } from "next";
import Link from "next/link";
import { ClearCart } from "@/components/ClearCart";

export const metadata: Metadata = { title: "Danke für deine Bestellung" };

export default function SuccessPage() {
  return (
    <section className="wrap section narrow">
      <ClearCart />
      <h1 className="page-title">Danke für deine Bestellung</h1>
      <p>
        Die Zahlung ist eingegangen und du bekommst gleich eine Bestätigung per E-Mail. Sobald dein Paket
        unterwegs ist, schicken wir dir die Sendungsnummer.
      </p>
      <Link className="button button-primary" href="/">
        Zurück zum Shop
      </Link>
    </section>
  );
}
