"use client";

import { useSyncExternalStore } from "react";
import type { CartLine } from "./types";

const KEY = "cart-v1";
const EVENT = "cart-change";
const EMPTY: CartLine[] = [];

let cache: { raw: string | null; lines: CartLine[] } = { raw: null, lines: EMPTY };

function read(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.lines;
  let lines: CartLine[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    lines = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    lines = EMPTY;
  }
  cache = { raw, lines };
  return lines;
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Storage blocked (private mode): the cart just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addToCart(productId: string, variantId: string, quantity: number) {
  const lines = [...read()];
  const existing = lines.find((l) => l.productId === productId && l.variantId === variantId);
  if (existing) {
    lines[lines.indexOf(existing)] = { ...existing, quantity: Math.min(existing.quantity + quantity, 10) };
  } else {
    lines.push({ productId, variantId, quantity });
  }
  write(lines);
}

export function setQuantity(productId: string, variantId: string, quantity: number) {
  const lines = read()
    .map((l) => (l.productId === productId && l.variantId === variantId ? { ...l, quantity } : l))
    .filter((l) => l.quantity > 0);
  write(lines);
}

export function clearCart() {
  write([]);
}
