"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Opens and closes the full-screen menu rendered in the layout (#site-menu).
 * The markup uses data attributes, so the static preview can drive the same menu.
 */
export function MenuController() {
  const pathname = usePathname();

  useEffect(() => {
    const menu = document.getElementById("site-menu");
    const toggle = document.querySelector<HTMLButtonElement>("[data-menu-open]");
    if (!menu || !toggle) return;

    const setOpen = (open: boolean) => {
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("menu-open", open);
      if (open) menu.querySelector<HTMLElement>("[data-menu-close]")?.focus();
      else toggle.focus({ preventScroll: true });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-menu-open]")) setOpen(true);
      else if (target.closest("[data-menu-close]") || target.closest("#site-menu a")) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !menu.hidden) setOpen(false);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Close after navigating.
  useEffect(() => {
    const menu = document.getElementById("site-menu");
    if (menu && !menu.hidden) {
      menu.hidden = true;
      document.body.classList.remove("menu-open");
      document.querySelector("[data-menu-open]")?.setAttribute("aria-expanded", "false");
    }
  }, [pathname]);

  return null;
}
