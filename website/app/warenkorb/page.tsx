import type { Metadata } from "next";
import { CartView } from "@/components/CartView";
import { SHIPPING, getProducts } from "@/lib/catalog";

export const metadata: Metadata = { title: "Warenkorb" };

export default function CartPage() {
  return (
    <section className="wrap section">
      <h1 className="page-title">Warenkorb</h1>
      <CartView
        products={getProducts()}
        shipping={{ flatCents: SHIPPING.flatCents, freeFromCents: SHIPPING.freeFromCents }}
      />
    </section>
  );
}
