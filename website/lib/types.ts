export type CategoryId = "ready-to-wear" | "bags" | "shoes" | "kids";

export type Silhouette =
  | "sweater" | "coat" | "skirt" | "shirt" | "trousers"
  | "tote" | "crossbody" | "shoulder" | "clutch"
  | "loafer" | "boot" | "flat" | "sneaker";

export interface Variant {
  /** Stable id used in the cart and in Stripe metadata. */
  id: string;
  /** What the customer picks, e.g. "38" or "Black". */
  label: string;
  /** CJ variant id. Without it the order cannot be sent to the supplier and is held. */
  supplierVid: string | null;
  supplierSku?: string;
  /** Supplier cost in USD, used for margin checks only. */
  costUsd?: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: CategoryId;
  /** Outline drawn on the placeholder image until real photos exist. */
  silhouette: Silhouette;
  colour: string;
  /** Final selling price in Rappen (1/100 CHF). */
  priceCents: number;
  compareAtCents?: number;
  description: string;
  details: string[];
  care: string[];
  /** Image URLs. Empty means the shop shows a colour placeholder. */
  images: string[];
  /** Placeholder colour for products without images. */
  swatch: string;
  variantLabel: string;
  variants: Variant[];
  deliveryDays: string;
  supplier: "cj" | "none";
  /** CJ search term, the reason this product is in the collection, and CJ listings found for it. */
  sourcing?: {
    keyword: string;
    why: string;
    cjCandidates?: { title: string; pid: string; url: string; options: string; cjPrice?: string }[];
  };
  /** Example products are shown with a notice and are never sent to a supplier. */
  example?: boolean;
  /** Imported products stay hidden until someone has reviewed them. */
  published: boolean;
}

export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  state?: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface OrderLine {
  productId: string;
  variantId: string;
  supplierVid: string | null;
  quantity: number;
  name: string;
}

export interface PaidOrder {
  /** Our order number, sent to the supplier so retries never create duplicates. */
  orderNumber: string;
  totalCents: number;
  lines: OrderLine[];
  shipping: ShippingAddress;
  /** Stripe Radar risk level, when available. */
  riskLevel?: string;
}

export type FulfillmentStatus = "submitted" | "held" | "failed" | "shipped";
