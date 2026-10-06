export interface SearchItem {
  slug: string;
  name: string;
  colour: string;
  category: string;
  priceCents: number;
  image: string | null;
  swatch: string;
  /** Lower-case, accent-free text the query is matched against. */
  text: string;
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Every word of the query must appear; matches in the name rank first. */
export function searchItems(items: SearchItem[], query: string, limit = 12): SearchItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return items
    .filter((item) => words.every((w) => item.text.includes(w)))
    .map((item) => ({ item, score: words.filter((w) => normalize(item.name).includes(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}
