// Brand copy, company details and legal texts (Swiss law).
// Everything in [square brackets] is a placeholder and must be replaced before going live.
// The legal texts are drafts written for a Swiss company selling online to consumers in
// Switzerland and Liechtenstein. Have them reviewed by a Swiss lawyer before launch.

export const company = {
  /** Registered company name incl. legal form, e.g. "Maison Elva GmbH". */
  legalName: "[Company Name GmbH]",
  street: "[Street and number]",
  postalCode: "[Postcode]",
  city: "[City]",
  country: "Switzerland",
  email: "[care@your-domain.ch]",
  phone: "[+41 xx xxx xx xx]",
  /** Swiss business identification number, e.g. CHE-123.456.789 */
  uid: "[CHE-xxx.xxx.xxx]",
  commercialRegister: "[Commercial Register of the Canton of …]",
  representative: "[First name Last name, Managing Director]",
  /** Only VAT-registered businesses (mandatory from CHF 100,000 turnover) may show Swiss VAT. */
  vatRegistered: false,
  vatRate: "8.1%",
  /** Swiss address that accepts returns. Returning goods to the supplier abroad is not practical. */
  returnAddress: "[Return address in Switzerland]",
  /** Client care hours shown on the contact page. */
  hours: "Monday to Friday, 9:00 to 17:00 CET",
};

export const brand = {
  name: "Maison Elva",
  tagline: "Considered pieces for the modern wardrobe",
  season: "Autumn–Winter 2026",
  campaignTitle: "The Quiet Season",
  campaignText:
    "Soft tailoring, deep tones and textures made to be touched. A wardrobe built on fewer, better pieces.",
  editTitle: "The Art of Layering",
  editText:
    "A camel knit over crisp linen, a trench thrown over both. Our new-season pieces are designed to work together, from the first cold morning to the last evening out.",
  about: [
    "Maison Elva was founded in Switzerland with a simple idea: a carefully edited wardrobe of clothing, bags and shoes, chosen for their lines, their materials and the way they wear.",
    "We release small collections each season instead of endless ranges. Every piece is selected to sit alongside the others, so that a few purchases go a long way.",
  ],
};

export const shipping = {
  regions: "Switzerland and Liechtenstein",
  flat: "CHF 6.90",
  freeFrom: "CHF 80",
  delivery: "8 to 15 business days",
};

export const priceNote = company.vatRegistered ? `Incl. ${company.vatRate} VAT` : "Final price in CHF";

export const announcements = [
  `Complimentary delivery on orders over ${shipping.freeFrom}`,
  "Returns accepted within 14 days",
];

export const services = [
  { title: "Complimentary delivery", text: `On all orders over ${shipping.freeFrom} within ${shipping.regions}.` },
  { title: "14-day returns", text: "Unworn pieces with their tags can be returned within 14 days of delivery." },
  { title: "Secure payment", text: "Pay by card, TWINT, Apple Pay or Google Pay through our payment partner Stripe." },
  { title: "Client care", text: `Our team answers every message personally, ${company.hours.toLowerCase()}.` },
];

// Size chart in centimetres (body measurements).
export const sizeChart = {
  clothing: {
    head: ["Size", "EU", "UK", "US", "Bust", "Waist", "Hips"],
    rows: [
      ["XS", "34", "6", "2", "80–83", "62–65", "88–91"],
      ["S", "36", "8", "4", "84–87", "66–69", "92–95"],
      ["M", "38", "10", "6", "88–91", "70–73", "96–99"],
      ["L", "40", "12", "8", "92–96", "74–78", "100–104"],
      ["XL", "42", "14", "10", "97–101", "79–83", "105–109"],
    ],
  },
  kids: {
    head: ["Size", "Age", "Child's height"],
    rows: [
      ["66", "3–6M", "62–68"],
      ["73", "6–12M", "68–74"],
      ["80", "12–18M", "74–80"],
      ["90", "18–24M", "80–90"],
      ["100", "2–3Y", "90–100"],
    ],
  },
  shoes: {
    head: ["EU", "UK", "US", "Foot length"],
    rows: [
      ["36", "3", "5.5", "23.0"],
      ["37", "4", "6.5", "23.7"],
      ["38", "5", "7.5", "24.3"],
      ["39", "6", "8.5", "25.0"],
      ["40", "6.5", "9", "25.7"],
      ["41", "7.5", "10", "26.3"],
    ],
  },
};

export interface TextPage {
  title: string;
  kind: "legal" | "service";
  updated?: string;
  sections: { heading?: string; paragraphs: string[] }[];
}

const address = `${company.legalName}, ${company.street}, ${company.postalCode} ${company.city}, ${company.country}`;

export const pages: Record<string, TextPage> = {
  imprint: {
    title: "Imprint",
    kind: "legal",
    sections: [
      {
        heading: "Operator of this online shop",
        paragraphs: [
          company.legalName,
          `${company.street}, ${company.postalCode} ${company.city}, ${company.country}`,
          `Email: ${company.email}`,
          `Telephone: ${company.phone}`,
        ],
      },
      {
        heading: "Registration",
        paragraphs: [
          `Registered in the ${company.commercialRegister}`,
          `Business identification number (UID): ${company.uid}`,
          `Authorised representative: ${company.representative}`,
        ],
      },
      {
        heading: "Disclaimer",
        paragraphs: [
          "We review the content of this website with care but cannot guarantee that it is complete, correct and up to date at all times. The operators of external websites we link to are solely responsible for their content.",
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    kind: "legal",
    updated: "[Date]",
    sections: [
      {
        paragraphs: [
          "This privacy policy explains how we process personal data when you visit our online shop or place an order. It is based on the Swiss Federal Act on Data Protection (FADP).",
        ],
      },
      {
        heading: "1. Controller",
        paragraphs: [`${address}. For any privacy request, write to ${company.email}.`],
      },
      {
        heading: "2. Data we process",
        paragraphs: [
          "Order data: your name, delivery address, email address, telephone number and the items you order.",
          "Payment data: payments are processed by Stripe. We never receive your full card details, only confirmation of whether and how a payment was made.",
          "Newsletter: if you subscribe, your email address and the date of your consent.",
          "Technical data: when you visit the website, our hosting provider processes technically necessary data such as your IP address, the date and time of access and your browser type in server log files.",
          "Shopping bag: the contents of your bag are stored only in your own browser. We do not use cookies for advertising or analytics.",
        ],
      },
      {
        heading: "3. Purposes",
        paragraphs: [
          "We process this data to accept, deliver and invoice your orders, to keep you informed about your order, to prevent payment fraud, to answer your enquiries, to send our newsletter if you have subscribed, and to comply with legal obligations such as record-keeping.",
        ],
      },
      {
        heading: "4. Recipients and transfers abroad",
        paragraphs: [
          "We work with the following service providers, who receive data on our behalf or to fulfil your order:",
          "Stripe Payments Europe Ltd. (Ireland) and Stripe, Inc. (USA) for payment processing.",
          "CJdropshipping (China), our fulfilment partner: name, delivery address, telephone number, email address and the items ordered, so that your parcel can be dispatched to you.",
          "Postal and courier services for delivery.",
          "Vercel Inc. (USA) for website hosting.",
          "[Email provider, e.g. Resend, Inc. (USA)] for order, shipping and newsletter emails.",
          "Ireland offers an adequate level of data protection. The USA is considered adequate for companies certified under the Swiss-U.S. Data Privacy Framework; for others we rely on standard contractual clauses. China does not offer an adequate level of data protection. Disclosure to our fulfilment partner is permitted under Art. 17(1)(b) FADP because it is directly necessary to perform the contract with you.",
        ],
      },
      {
        heading: "5. Retention",
        paragraphs: [
          "We keep order and accounting records for as long as the law requires, generally ten years (Art. 958f of the Swiss Code of Obligations). Newsletter data is deleted when you unsubscribe. Other data is deleted once it is no longer needed for its purpose.",
        ],
      },
      {
        heading: "6. Your rights",
        paragraphs: [
          "You may request access to your personal data (Art. 25 FADP), ask us to correct or delete it, object to its processing and request a copy of your data in a common format (Art. 28 FADP). To do so, write to the email address above.",
          "You may also lodge a complaint with the Federal Data Protection and Information Commissioner (FDPIC).",
        ],
      },
      {
        heading: "7. Changes",
        paragraphs: ["We may update this privacy policy. The version published on this page applies."],
      },
    ],
  },

  terms: {
    title: "Terms and Conditions",
    kind: "legal",
    updated: "[Date]",
    sections: [
      {
        heading: "1. Scope",
        paragraphs: [
          `These terms apply to all orders placed in the ${brand.name} online shop operated by ${company.legalName} ("we", "us"). We deliver to customers in ${shipping.regions}.`,
        ],
      },
      {
        heading: "2. How your order is concluded",
        paragraphs: [
          "Product presentations in the shop are not a binding offer. You add items to your bag and select Checkout. On the secure payment page you enter your email address, delivery address and payment details and can review and correct all entries and the order summary before paying.",
          "By completing payment you place a binding order. We confirm receipt of your order by email without delay. The contract is concluded with this confirmation.",
          "If an item cannot be delivered, we inform you immediately and refund any amount already paid in full.",
        ],
      },
      {
        heading: "3. Prices",
        paragraphs: [
          company.vatRegistered
            ? `All prices are final prices in Swiss francs (CHF) including ${company.vatRate} VAT.`
            : "All prices are final prices in Swiss francs (CHF). We are not registered for VAT and therefore do not charge or show VAT.",
          `Delivery costs ${shipping.flat} per order and is complimentary on orders over ${shipping.freeFrom}. Delivery costs are shown before you complete your order.`,
        ],
      },
      {
        heading: "4. Payment",
        paragraphs: [
          "Payment is due when you place your order and is processed by our payment provider Stripe. The available payment methods, such as credit card or TWINT, are shown at checkout.",
        ],
      },
      {
        heading: "5. Delivery",
        paragraphs: [
          "Items are dispatched directly from our fulfilment partner's warehouse abroad. The estimated delivery time is shown on each product page. Orders containing several items may arrive in separate parcels at no extra cost to you.",
          "Once your order has been dispatched, you receive an email with the tracking number.",
        ],
      },
      {
        heading: "6. Customs and import charges",
        paragraphs: [
          "[Decision needed – choose one of the two options and delete the other:]",
          "[Option A: Any customs duties, import VAT and carrier clearance fees are paid by us. You will not be asked to pay anything on delivery.]",
          "[Option B: For parcels with a value from around CHF 62, import VAT and carrier clearance fees may be charged on delivery. These charges are payable by you.]",
        ],
      },
      {
        heading: "7. Voluntary returns",
        paragraphs: [
          "Swiss law does not provide a statutory right of withdrawal for online purchases. We nevertheless offer a voluntary return policy of 14 days from delivery, as described on our Returns page.",
        ],
      },
      {
        heading: "8. Warranty",
        paragraphs: [
          "The statutory warranty under Art. 197 et seq. of the Swiss Code of Obligations (CO) applies. The warranty period is two years from delivery (Art. 210 CO).",
          "Please inspect your order on arrival and report any defect as soon as you discover it, ideally with photos (Art. 201 CO). For a justified claim we will send an equivalent replacement or refund the purchase price. Your further statutory rights remain reserved.",
        ],
      },
      {
        heading: "9. Liability",
        paragraphs: [
          "We are liable for damages caused intentionally or through gross negligence. Liability for slight negligence is excluded to the extent permitted by law (Art. 100 CO). Liability under the Swiss Product Liability Act remains unaffected.",
        ],
      },
      {
        heading: "10. Data protection",
        paragraphs: ["How we process your personal data is described in our Privacy Policy."],
      },
      {
        heading: "11. Governing law and jurisdiction",
        paragraphs: [
          "These terms are governed by Swiss law, excluding the United Nations Convention on Contracts for the International Sale of Goods (CISG).",
          `The place of jurisdiction is ${company.city}. Consumers may also bring proceedings at the courts of their place of residence (Art. 32 Swiss Civil Procedure Code).`,
        ],
      },
    ],
  },

  returns: {
    title: "Returns",
    kind: "service",
    sections: [
      {
        paragraphs: [
          "Swiss law does not provide a statutory right of withdrawal for online purchases. We want you to love what you ordered, so we offer a voluntary return policy.",
        ],
      },
      {
        heading: "How to return an item",
        paragraphs: [
          "You may return items within 14 days of delivery, provided they are unworn, undamaged and still carry their original tags.",
          `Please email ${company.email} with your order number first. Then send the items to: ${company.returnAddress}.`,
          "Return shipping is at your expense. Once we have received and checked your return, we refund the purchase price to your original payment method within 14 days. Original delivery costs are not refunded.",
        ],
      },
      {
        heading: "Exclusions",
        paragraphs: ["For hygiene reasons, underwear, swimwear and hosiery cannot be returned once the seal has been removed."],
      },
      {
        heading: "Damaged or incorrect items",
        paragraphs: [
          "If you receive a damaged or incorrect item, please write to us within 7 days of delivery and include photos. You will not need to send anything back, and we will cover all costs.",
        ],
      },
    ],
  },

  shipping: {
    title: "Shipping",
    kind: "service",
    sections: [
      {
        heading: "Destinations and costs",
        paragraphs: [
          `We deliver to ${shipping.regions}. Delivery costs ${shipping.flat} and is complimentary on orders over ${shipping.freeFrom}.`,
        ],
      },
      {
        heading: "Delivery time",
        paragraphs: [
          `Our pieces are dispatched directly from our fulfilment partner's warehouse abroad. Delivery usually takes ${shipping.delivery}; the estimate for each item is shown on its product page. As soon as your order is on its way, we email you the tracking number.`,
        ],
      },
      {
        heading: "Customs and import charges",
        paragraphs: ["[Insert the same text as section 6 of the Terms and Conditions once decided.]"],
      },
    ],
  },

  contact: {
    title: "Client Care",
    kind: "service",
    sections: [
      {
        paragraphs: [
          `Our client care team is available ${company.hours}. We reply to every message within one business day.`,
        ],
      },
      { heading: "Email", paragraphs: [company.email] },
      { heading: "Telephone", paragraphs: [company.phone] },
      { heading: "Address", paragraphs: [address] },
    ],
  },

  about: {
    title: "About",
    kind: "service",
    sections: [{ paragraphs: brand.about }],
  },
};

export const footerLinks = {
  "Client Services": [
    { href: "/pages/contact", label: "Contact us" },
    { href: "/pages/shipping", label: "Shipping" },
    { href: "/pages/returns", label: "Returns" },
    { href: "/pages/size-guide", label: "Size guide" },
  ],
  "The House": [
    { href: "/pages/about", label: "About" },
    { href: "/shop/ready-to-wear", label: "Ready-to-Wear" },
    { href: "/shop/bags", label: "Bags" },
    { href: "/shop/shoes", label: "Shoes" },
    { href: "/shop/kids", label: "Kids" },
  ],
  Legal: [
    { href: "/pages/terms", label: "Terms and conditions" },
    { href: "/pages/privacy", label: "Privacy policy" },
    { href: "/pages/imprint", label: "Imprint" },
  ],
};
