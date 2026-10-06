"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { searchItems, type SearchItem } from "@/lib/search";
import { Money } from "./Money";

/**
 * Full-screen search opened by any [data-search-open] button. The markup uses data attributes,
 * so the static preview can drive the same overlay.
 */
export function SearchOverlay({ items, suggestions }: { items: SearchItem[]; suggestions: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const results = searchItems(items, query);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-search-open]")) setOpen(true);
      else if (target.closest("[data-search-close]")) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    document.querySelectorAll("[data-search-open]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
    if (open) input.current?.focus();
  }, [open]);

  // Close after navigating.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div id="site-search" className="search-overlay" role="dialog" aria-modal="true" aria-label="Search" hidden={!open}>
      <div className="wrap search-top">
        <form className="search-form" role="search" onSubmit={(e) => e.preventDefault()}>
          <label className="visually-hidden" htmlFor="search-input">
            Search the collection
          </label>
          <input
            ref={input}
            id="search-input"
            type="search"
            data-search-input
            placeholder="Search the collection"
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <button type="button" className="label search-close" data-search-close>
          Close
        </button>
      </div>
      <div className="wrap search-body">
        <p className="label muted" data-search-status role="status">
          {query.trim() === ""
            ? "Suggestions"
            : results.length === 0
              ? `No results for “${query.trim()}”`
              : `${results.length} ${results.length === 1 ? "result" : "results"}`}
        </p>
        <ul className="search-suggestions" data-search-suggestions hidden={query.trim() !== ""}>
          {suggestions.map((s) => (
            <li key={s.href}>
              <Link href={s.href} onClick={() => setOpen(false)}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="search-results" data-search-results>
          {results.map((r) => (
            <li key={r.slug}>
              <Link href={`/product/${r.slug}`} className="search-result" onClick={() => setOpen(false)}>
                <span className="search-thumb" style={{ backgroundColor: r.swatch }}>
                  {r.image && <img src={r.image} alt="" loading="lazy" />}
                </span>
                <span className="search-result-info">
                  <span className="name">{r.name}</span>
                  <span className="muted small">
                    {r.colour ? `${r.colour} · ` : ""}
                    {r.category}
                  </span>
                </span>
                <span className="small">
                  <Money cents={r.priceCents} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
