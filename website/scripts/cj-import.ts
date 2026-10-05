// Imports products from CJdropshipping into data/products.json.
//
//   CJ_API_KEY=... npm run cj:import -- --keyword "women loafers" --category shoes --limit 5
//   CJ_API_KEY=... npm run cj:import -- --plan --limit 3
//
// --plan handles every product that has no CJ variant yet: listings already chosen in
// "sourcing.cjCandidates" are imported by their CJ product id, the rest are searched by
// "sourcing.keyword". Everything lands as unpublished candidates to compare and choose from.
//
// Options: --markup 2.5 (price = CJ cost × markup), --usd-chf 0.80, --country DE (only items
// stocked in that country's warehouse). Imported products are saved with "published": false.
// Check name, text, sizes and images, then set "published": true to put them in the shop.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CjSupplier, cjConfigFromEnv } from "../lib/suppliers/cj";
import type { CategoryId, Product } from "../lib/types";

const { values } = parseArgs({
  options: {
    keyword: { type: "string" },
    category: { type: "string" },
    limit: { type: "string", default: "5" },
    markup: { type: "string", default: "2.5" },
    "usd-chf": { type: "string", default: "0.80" },
    country: { type: "string" },
    plan: { type: "boolean", default: false },
  },
});

const categoryIds: CategoryId[] = ["ready-to-wear", "bags", "shoes"];
if (!values.plan && (!values.keyword || !categoryIds.includes(values.category as CategoryId))) {
  console.error(`Usage: npm run cj:import -- --keyword "<search>" --category ${categoryIds.join("|")} [--limit 5]`);
  process.exit(1);
}

const config = cjConfigFromEnv();
if (!config) {
  console.error("CJ_API_KEY is not set.");
  process.exit(1);
}

const cj = new CjSupplier(config);
const markup = Number(values.markup);
const usdToChf = Number(values["usd-chf"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Price in Rappen, rounded up to end in .90 (e.g. CHF 37.12 -> CHF 37.90). */
export function shopPriceCents(costUsd: number): number {
  const francs = costUsd * usdToChf * markup;
  return Math.ceil(francs - 0.9) * 100 + 90;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60);
}

async function main() {
  const file = join(import.meta.dirname, "..", "data", "products.json");
  const products = JSON.parse(readFileSync(file, "utf8")) as Product[];

  const todo = values.plan
    ? products.filter((p) => p.sourcing && p.variants.every((v) => !v.supplierVid))
    : [];

  for (const item of todo) {
    const candidates = item.sourcing!.cjCandidates ?? [];
    for (const candidate of candidates) {
      await importPid(products, candidate.pid, item.category);
    }
    if (!candidates.length) {
      await sleep(1100);
      await importSearch(products, item.sourcing!.keyword, item.category);
    }
  }
  if (!values.plan) {
    await importSearch(products, values.keyword!, values.category as CategoryId);
  }

  writeFileSync(file, JSON.stringify(products, null, 2) + "\n");
  console.log(`Saved to ${file}. New products are unpublished until you review them.`);
}

async function importSearch(products: Product[], keyword: string, category: CategoryId) {
  const found = await cj.searchProducts({
    keyWord: keyword,
    size: Number(values.limit),
    countryCode: values.country,
  });
  console.log(`Found ${found.length} products for "${keyword}".`);

  for (const hit of found) {
    await importPid(products, hit.id, category);
  }
}

async function importPid(products: Product[], pid: string, category: CategoryId) {
  if (products.some((p) => p.id === `cj-${pid}`)) {
    console.log(`- skipped (already imported): ${pid}`);
    return;
  }
  await sleep(1100); // CJ allows one request per second.
  const detail = await cj.getProduct(pid);
  if (!detail.variants?.length) return;

  const maxCost = Math.max(...detail.variants.map((v) => v.variantSellPrice));
  products.push({
    id: `cj-${pid}`,
    slug: `${slugify(detail.productNameEn)}-${pid.slice(-6).toLowerCase()}`,
    name: detail.productNameEn,
    category,
    silhouette: category === "bags" ? "tote" : category === "shoes" ? "loafer" : "shirt",
    colour: "",
    priceCents: shopPriceCents(maxCost),
    description: "",
    details: [],
    care: [],
    images: (detail.productImageSet?.length ? detail.productImageSet : [detail.bigImage]).filter(Boolean),
    swatch: "#d9d4dc",
    variantLabel: "Option",
    variants: detail.variants.map((v) => ({
      id: v.vid,
      label: v.variantKey || v.variantSku,
      supplierVid: v.vid,
      supplierSku: v.variantSku,
      costUsd: v.variantSellPrice,
    })),
    deliveryDays: values.country && values.country !== "CN" ? "5–10 business days" : "8–15 business days",
    supplier: "cj",
    published: false,
  });
  console.log(`+ ${detail.productNameEn}: cost up to $${maxCost}, price CHF ${(shopPriceCents(maxCost) / 100).toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
