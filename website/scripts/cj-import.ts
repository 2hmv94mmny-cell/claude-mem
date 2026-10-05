// Imports products from CJdropshipping into data/products.json.
//
//   CJ_API_KEY=... npm run cj:import -- --keyword "women loafers" --category schuhe --limit 5
//
// Options: --markup 2.5 (price = CJ cost × markup), --usd-eur 0.92, --country DE (only items
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
    "usd-eur": { type: "string", default: "0.92" },
    country: { type: "string" },
  },
});

const categoryIds: CategoryId[] = ["kleidung", "taschen", "schuhe"];
if (!values.keyword || !categoryIds.includes(values.category as CategoryId)) {
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
const usdToEur = Number(values["usd-eur"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rounds up to a price ending in ,95 (e.g. 37.12 € -> 37,95 €). */
export function shopPriceCents(costUsd: number): number {
  const euros = costUsd * usdToEur * markup;
  return Math.ceil(euros - 0.95) * 100 + 95;
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

  const found = await cj.searchProducts({
    keyWord: values.keyword!,
    size: Number(values.limit),
    countryCode: values.country,
  });
  console.log(`Found ${found.length} products for "${values.keyword}".`);

  for (const hit of found) {
    if (products.some((p) => p.id === `cj-${hit.id}`)) {
      console.log(`- skipped (already imported): ${hit.nameEn}`);
      continue;
    }
    await sleep(1100); // CJ allows one request per second.
    const detail = await cj.getProduct(hit.id);
    if (!detail.variants?.length) continue;

    const maxCost = Math.max(...detail.variants.map((v) => v.variantSellPrice));
    const slug = `${slugify(detail.productNameEn)}-${hit.id.slice(0, 6).toLowerCase()}`;
    products.push({
      id: `cj-${hit.id}`,
      slug,
      name: detail.productNameEn,
      category: values.category as CategoryId,
      priceCents: shopPriceCents(maxCost),
      description: "",
      details: [],
      images: (detail.productImageSet?.length ? detail.productImageSet : [detail.bigImage]).filter(Boolean),
      swatch: "#d9d4dc",
      variantLabel: "Variante",
      variants: detail.variants.map((v) => ({
        id: v.vid,
        label: v.variantKey || v.variantSku,
        supplierVid: v.vid,
        supplierSku: v.variantSku,
        costUsd: v.variantSellPrice,
      })),
      deliveryDays: values.country === "DE" ? "3–6 Werktage" : "8–14 Werktage",
      supplier: "cj",
      published: false,
    });
    console.log(`+ ${detail.productNameEn}: cost up to $${maxCost}, price ${(shopPriceCents(maxCost) / 100).toFixed(2)} €`);
  }

  writeFileSync(file, JSON.stringify(products, null, 2) + "\n");
  console.log(`Saved to ${file}. New products are unpublished until you review them.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
