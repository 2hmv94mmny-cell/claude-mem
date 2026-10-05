// Shop name and texts. Replace the placeholders with your own details before going live.

export const shop = {
  name: "Maison Elva",
  tagline: "Kleidung, Taschen und Schuhe für jeden Tag",
  intro:
    "Ausgewählte Teile in Größen XS bis XL und Schuhgrößen 36 bis 41. Kostenloser Versand ab 60 €, 14 Tage Widerrufsrecht.",
  email: "hallo@maison-elva.example",
};

export const promises = [
  { title: "Versand", text: "4,95 €, ab 60 € kostenlos. Lieferung nach Deutschland und Österreich." },
  { title: "Lieferzeit", text: "Die Lieferzeit steht bei jedem Artikel, meist 6 bis 10 Werktage." },
  { title: "Rückgabe", text: "14 Tage Widerrufsrecht ab Erhalt der Ware." },
  { title: "Bezahlung", text: "Karte, PayPal, Klarna oder Apple Pay über Stripe – je nach Einstellung." },
];

// Legal pages. These are placeholders and must be replaced with real texts
// (e.g. from a legal text generator or a lawyer) before the shop goes live.
export const legalPages: Record<string, { title: string; body: string[] }> = {
  impressum: {
    title: "Impressum",
    body: [
      "Angaben gemäß § 5 DDG: Vor- und Nachname bzw. Firma, ladungsfähige Anschrift, E-Mail-Adresse, Telefonnummer, gegebenenfalls Handelsregister und Umsatzsteuer-ID.",
      "Platzhalter – bitte vor dem Start mit den echten Angaben ersetzen.",
    ],
  },
  datenschutz: {
    title: "Datenschutzerklärung",
    body: [
      "Hier gehört eine vollständige Datenschutzerklärung hin, unter anderem zu Stripe (Zahlung), dem Lieferanten (Versand), dem E-Mail-Dienst und dem Hosting.",
      "Platzhalter – bitte vor dem Start ersetzen.",
    ],
  },
  agb: {
    title: "Allgemeine Geschäftsbedingungen",
    body: ["Platzhalter für die AGB des Shops – bitte vor dem Start ersetzen."],
  },
  widerruf: {
    title: "Widerrufsbelehrung",
    body: [
      "Verbraucherinnen und Verbraucher haben ein vierzehntägiges Widerrufsrecht. Hier gehören die vollständige Widerrufsbelehrung und das Muster-Widerrufsformular hin.",
      "Platzhalter – bitte vor dem Start ersetzen.",
    ],
  },
  versand: {
    title: "Versand und Lieferzeiten",
    body: [
      "Wir liefern nach Deutschland und Österreich. Der Versand kostet 4,95 €, ab einem Bestellwert von 60 € ist er kostenlos.",
      "Die Lieferzeit steht auf jeder Produktseite. Sobald deine Bestellung unterwegs ist, bekommst du eine E-Mail mit der Sendungsnummer.",
    ],
  },
};
