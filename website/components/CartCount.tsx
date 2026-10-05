"use client";

import { useCart } from "@/lib/cart-store";

export function CartCount() {
  const count = useCart().reduce((sum, l) => sum + l.quantity, 0);
  return <span className="bag-count">({count})</span>;
}
