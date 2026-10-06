import { describe, expect, it } from "vitest";
import { detectCurrency, formatMoney } from "../lib/currency";
import { normalize, searchItems, type SearchItem } from "../lib/search";

const item = (name: string, colour: string, extra = ""): SearchItem => ({
  slug: normalize(name).replace(/\s+/g, "-"),
  name,
  colour,
  category: "Ready-to-Wear",
  priceCents: 18900,
  image: null,
  swatch: "#000",
  text: normalize(`${name} ${colour} Ready-to-Wear ${extra}`),
});

describe("search", () => {
  const items = [item("Soft Faux Fur Coat", "White"), item("Wool Trench", "Camel", "coat belted"), item("Café Tote", "Black")];

  it("needs every word and ranks name matches first", () => {
    expect(searchItems(items, "coat").map((i) => i.name)).toEqual(["Soft Faux Fur Coat", "Wool Trench"]);
    expect(searchItems(items, "white coat").map((i) => i.name)).toEqual(["Soft Faux Fur Coat"]);
  });

  it("ignores case and accents, and returns nothing for an empty query", () => {
    expect(searchItems(items, "CAFE")).toHaveLength(1);
    expect(searchItems(items, "   ")).toEqual([]);
  });
});

describe("currency", () => {
  it("detects the currency from the browser language region", () => {
    expect(detectCurrency(["de-CH"])).toBe("CHF");
    expect(detectCurrency(["en-GB"])).toBe("GBP");
    expect(detectCurrency(["fr-FR"])).toBe("EUR");
    expect(detectCurrency(["ja"])).toBe("JPY");
    expect(detectCurrency(["es-AR"])).toBe("USD");
  });

  it("formats CHF exactly and converted prices in whole units", () => {
    expect(formatMoney(18900, "CHF")).toMatch(/CHF\s?189\.00/);
    expect(formatMoney(18900, "EUR")).toBe("€202");
    expect(formatMoney(18900, "USD")).toBe("$236");
  });
});
