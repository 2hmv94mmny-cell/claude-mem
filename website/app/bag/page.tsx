import type { Metadata } from "next";
import { CartView } from "@/components/CartView";
import { SHIPPING, getProducts } from "@/lib/catalog";
import { priceNote } from "@/content";

export const metadata: Metadata = { title: "Shopping Bag" };

export default function BagPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Shopping Bag</h1>
      </header>
      <CartView
        products={getProducts()}
        shipping={{ flatCents: SHIPPING.flatCents, freeFromCents: SHIPPING.freeFromCents }}
        priceNote={priceNote}
      />
    </div>
  );
}
