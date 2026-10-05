// Turns the static export in out/ into one self-contained HTML file
// (CSS inlined, Next.js runtime scripts removed) for publishing as a Claude artifact.
// Usage: npm run build && node scripts/export-artifact.mjs <output-file>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = new URL("../out/", import.meta.url).pathname;
const target = process.argv[2] ?? join(outDir, "artifact.html");
const html = readFileSync(join(outDir, "index.html"), "utf8");

const title = html.match(/<title>(.*?)<\/title>/s)?.[1] ?? "Website";
const fontLinks = [...html.matchAll(/<link[^>]+href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/g)].map((m) => m[0]);
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/_next\/[^"]+\.css)"[^>]*>/g)]
  .map((m) => readFileSync(join(outDir, m[1]), "utf8"))
  .join("\n");
const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? "")
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<link[^>]*>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "");

writeFileSync(target, `<title>${title}</title>\n${fontLinks.join("\n")}\n<style>${css}</style>\n${body}\n`);
console.log(`Wrote ${target}`);
