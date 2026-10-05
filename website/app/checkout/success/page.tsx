import type { Metadata } from "next";
import Link from "next/link";
import { ClearCart } from "@/components/ClearCart";

export const metadata: Metadata = { title: "Thank you for your order" };

export default function SuccessPage() {
  return (
    <section className="wrap success">
      <ClearCart />
      <span className="label muted">Order confirmed</span>
      <h1>Thank you</h1>
      <p className="muted">
        Your payment was successful and a confirmation is on its way to your inbox. As soon as your order has been
        dispatched, we will email you the tracking number.
      </p>
      <Link className="button" href="/">
        Continue shopping
      </Link>
    </section>
  );
}
