// Builds a single-file, clickable preview of the shop (e.g. for a Claude artifact).
//
//   npm run build && node scripts/export-artifact.mjs <output-file>
//
// Every prerendered page is embedded as a <template>; a small script switches between them
// via the URL hash and re-creates the interactive parts (size selection, bag, newsletter)
// without the Next.js runtime. Payment is disabled in the preview.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const appDir = join(root, ".next/server/app");
const target = process.argv[2] ?? join(root, "preview.html");
const products = JSON.parse(readFileSync(join(root, "data/products.json"), "utf8")).filter((p) => p.published);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".html") ? [full] : [];
  });
}

/** "/shop/bags" -> "#shop-bags", "/" -> "#home" */
function routeId(path) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean === "" || clean === "index" ? "home" : clean.replace(/\//g, "-");
}

// Page links become hash routes; images from public/ become relative paths published alongside the page.
function rewriteLinks(html) {
  return html
    .replace(/href="(\/[^"#?]*)"/g, (_, path) => `href="#${routeId(path)}"`)
    .replace(/src="\/images\//g, 'src="images/');
}

function clean(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<link[^>]*>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

const index = readFileSync(join(appDir, "index.html"), "utf8");
const title = index.match(/<title>(.*?)<\/title>/s)?.[1] ?? "Preview";
const css = [...index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/_next\/(static\/[^"]+\.css)"[^>]*>/g)]
  .map((m) => readFileSync(join(root, ".next", m[1]), "utf8"))
  .join("\n");
const body = index.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
const beforeMain = rewriteLinks(clean(body.slice(0, body.indexOf("<main>"))));
const afterMain = rewriteLinks(clean(body.slice(body.indexOf("</main>") + "</main>".length)));

const skip = new Set(["_global-error", "_not-found", "checkout-success"]);
const templates = walk(appDir)
  .map((file) => {
    const id = routeId("/" + relative(appDir, file).replace(/\.html$/, ""));
    if (skip.has(id)) return "";
    const main = readFileSync(file, "utf8").match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? "";
    return `<template id="r-${id}">${rewriteLinks(clean(main))}</template>`;
  })
  .join("\n");

const catalog = products.map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  colour: p.colour,
  price: p.priceCents,
  variantLabel: p.variantLabel,
  deliveryDays: p.deliveryDays,
  variants: p.variants.map((v) => ({ id: v.id, label: v.label })),
}));

const script = `
(() => {
  const PRODUCTS = ${JSON.stringify(catalog)};
  const FLAT = 690, FREE_FROM = 8000, KEY = "preview-bag";
  const chf = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" });
  const money = (c) => chf.format(c / 100);
  const view = document.getElementById("view");
  let memory = [];

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return memory; } };
  const write = (lines) => { memory = lines; try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {} updateCount(); };
  const updateCount = () => {
    const n = read().reduce((s, l) => s + l.quantity, 0);
    document.querySelectorAll(".bag-count").forEach((el) => (el.textContent = "(" + n + ")"));
  };
  const current = () => location.hash.slice(1) || "home";
  const productForRoute = () => PRODUCTS.find((p) => "product-" + p.slug === current());

  function imageFor(slug) {
    const tpl = document.getElementById("r-product-" + slug);
    const frame = tpl && tpl.content.querySelector(".gallery .frame");
    return frame ? frame.innerHTML : "";
  }

  function renderBag() {
    const lines = read().flatMap((l) => {
      const p = PRODUCTS.find((x) => x.id === l.productId);
      const v = p && p.variants.find((x) => x.id === l.variantId);
      return p && v ? [{ ...l, p, v }] : [];
    });
    const host = view.querySelector(".bag, .empty");
    if (!host) return;
    if (!lines.length) {
      host.outerHTML = '<div class="empty"><p class="muted">Your shopping bag is empty.</p><a class="button" href="#shop-ready-to-wear">Continue shopping</a></div>';
      return;
    }
    const subtotal = lines.reduce((s, l) => s + l.p.price * l.quantity, 0);
    const delivery = subtotal >= FREE_FROM ? 0 : FLAT;
    const progress = Math.min(1, subtotal / FREE_FROM) * 100;
    const items = lines.map((l) => \`
      <li class="bag-line">
        <a class="frame" href="#product-\${l.p.slug}" aria-label="\${l.p.name}">\${imageFor(l.p.slug)}</a>
        <div class="bag-line-info">
          <a class="name" href="#product-\${l.p.slug}">\${l.p.name}</a>
          <span class="muted small">\${l.p.colour ? l.p.colour + " · " : ""}\${l.p.variantLabel} \${l.v.label}</span>
          <span class="muted small">Delivery in \${l.p.deliveryDays}</span>
          <div class="bag-line-actions">
            <span class="qty" aria-label="Quantity">
              <button type="button" data-qty="-1" data-p="\${l.p.id}" data-v="\${l.v.id}" aria-label="Decrease quantity">−</button>
              <span>\${l.quantity}</span>
              <button type="button" data-qty="1" data-p="\${l.p.id}" data-v="\${l.v.id}" aria-label="Increase quantity" \${l.quantity >= 10 ? "disabled" : ""}>+</button>
            </span>
            <button type="button" class="remove" data-remove data-p="\${l.p.id}" data-v="\${l.v.id}">Remove</button>
          </div>
        </div>
        <span class="price">\${money(l.p.price * l.quantity)}</span>
      </li>\`).join("");
    host.outerHTML = \`
      <div class="bag">
        <ul class="bag-lines">\${items}</ul>
        <aside class="summary" aria-label="Order summary">
          <span class="label">Order summary</span>
          <div class="progress">
            <span>\${delivery === 0 ? "You qualify for complimentary delivery." : money(FREE_FROM - subtotal) + " away from complimentary delivery."}</span>
            <div class="progress-track"><div class="progress-fill" style="width:\${progress}%"></div></div>
          </div>
          <dl>
            <div><dt>Subtotal</dt><dd>\${money(subtotal)}</dd></div>
            <div><dt>Delivery</dt><dd>\${delivery === 0 ? "Complimentary" : money(delivery)}</dd></div>
            <div class="total"><dt>Total</dt><dd>\${money(subtotal + delivery)}</dd></div>
          </dl>
          <p class="fine">Final price in CHF. You enter your delivery address and payment details on the next step.</p>
          <button class="button block" type="button" data-checkout>Proceed to checkout</button>
          <p class="error" role="alert" hidden data-checkout-note>This is a preview. Checkout opens once payments are connected.</p>
          <p class="fine">Secure payment by Stripe: card, TWINT, Apple Pay, Google Pay. Shipped from abroad, see <a href="#pages-shipping">customs and import charges</a>.</p>
        </aside>
      </div>\`;
  }

  function setMenu(open) {
    const menu = document.getElementById("site-menu");
    if (!menu) return;
    menu.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    document.querySelector("[data-menu-open]")?.setAttribute("aria-expanded", String(open));
  }

  function route() {
    const id = current();
    const tpl = document.getElementById("r-" + id) || document.getElementById("r-home");
    view.innerHTML = tpl.innerHTML;
    setMenu(false);
    if (id === "bag") renderBag();
    updateCount();
    window.scrollTo(0, 0);
  }

  document.addEventListener("change", (e) => {
    const input = e.target.closest('input[name="variant"]');
    if (!input) return;
    const buy = input.closest(".buy");
    buy.querySelectorAll(".option").forEach((o) => o.classList.toggle("selected", o.contains(input)));
    const button = buy.querySelector("button.button");
    button.disabled = false;
    button.textContent = "Add to bag";
    buy.querySelector(".added")?.remove();
  });

  document.addEventListener("click", (e) => {
    const t = e.target;
    const addButton = t.closest(".buy button.button");
    if (addButton) {
      const buy = addButton.closest(".buy");
      const selected = buy.querySelector('input[name="variant"]:checked');
      const product = productForRoute();
      if (!selected || !product) return;
      const lines = read();
      const line = lines.find((l) => l.productId === product.id && l.variantId === selected.value);
      if (line) line.quantity = Math.min(10, line.quantity + 1);
      else lines.push({ productId: product.id, variantId: selected.value, quantity: 1 });
      write(lines);
      if (!buy.querySelector(".added")) {
        buy.insertAdjacentHTML("beforeend", '<div class="added" role="status"><span>Added to your bag</span><a class="cta-link" href="#bag">View bag</a></div>');
      }
      return;
    }
    const qty = t.closest("[data-qty]");
    const remove = t.closest("[data-remove]");
    if (qty || remove) {
      const el = qty || remove;
      const lines = read()
        .map((l) => l.productId === el.dataset.p && l.variantId === el.dataset.v
          ? { ...l, quantity: remove ? 0 : Math.min(10, l.quantity + Number(el.dataset.qty)) } : l)
        .filter((l) => l.quantity > 0);
      write(lines);
      renderBag();
      return;
    }
    if (t.closest("[data-checkout]")) {
      const note = view.querySelector("[data-checkout-note]");
      if (note) note.hidden = false;
      return;
    }
    if (t.closest("[data-menu-open]")) { setMenu(true); return; }
    if (t.closest("[data-menu-close]") || t.closest("#site-menu a")) setMenu(false);
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest(".newsletter-form");
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector("input[type=email]");
    if (!input.checkValidity()) { input.reportValidity(); return; }
    form.outerHTML = '<p role="status">Thank you. You are now on our list.</p>';
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  window.addEventListener("hashchange", route);
  route();
})();
`;

const html = `<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&family=Jost:wght@400;500&display=swap">
<style>${css}</style>
${beforeMain}
<main id="view"></main>
${afterMain}
${templates}
<script>${script}</script>
`;

writeFileSync(target, html);
console.log(`Wrote ${target} (${(html.length / 1024).toFixed(0)} KB, ${templates.split("<template").length - 1} pages)`);
