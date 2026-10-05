// Shop name, company details and legal texts (Swiss law).
// Everything in [square brackets] is a placeholder and must be replaced before going live.
// The legal texts are drafts: have them checked by a Swiss lawyer or a legal text service.

export const company = {
  /** Registered company name incl. legal form, e.g. "Maison Elva GmbH". */
  legalName: "[Firmenname GmbH]",
  street: "[Strasse Nr.]",
  postalCode: "[PLZ]",
  city: "[Ort]",
  country: "Schweiz",
  email: "[hallo@deine-domain.ch]",
  phone: "[+41 xx xxx xx xx]",
  /** Unternehmens-Identifikationsnummer, e.g. CHE-123.456.789 */
  uid: "[CHE-xxx.xxx.xxx]",
  commercialRegister: "[Handelsregister des Kantons …]",
  representative: "[Vorname Nachname, Geschäftsführerin]",
  /** Only registered businesses (usually from CHF 100'000 turnover) may show Swiss VAT. */
  vatRegistered: false,
  vatRate: "8,1 %",
  /** Swiss address that accepts returns. Sending returns to the supplier abroad is not practical. */
  returnAddress: "[Rücksendeadresse in der Schweiz]",
};

export const shop = {
  name: "Maison Elva",
  tagline: "Kleidung, Taschen und Schuhe für jeden Tag",
  intro:
    "Ausgewählte Teile in den Grössen XS bis XL und Schuhgrössen 36 bis 41. Versand in die ganze Schweiz, ab CHF 80 kostenlos.",
};

export const shipping = {
  countriesLabel: "die Schweiz und Liechtenstein",
  flatLabel: "CHF 6.90",
  freeFromLabel: "CHF 80",
  deliveryLabel: "8 bis 15 Werktage",
};

export const priceNote = company.vatRegistered
  ? `Endpreis inkl. ${company.vatRate} MWST, zzgl. Versand`
  : "Endpreis in CHF, zzgl. Versand";

export const promises = [
  { title: "Versand", text: `${shipping.flatLabel}, ab ${shipping.freeFromLabel} kostenlos. Lieferung in ${shipping.countriesLabel}.` },
  { title: "Lieferzeit", text: `Die Lieferzeit steht bei jedem Artikel, meist ${shipping.deliveryLabel}.` },
  { title: "Rückgabe", text: "14 Tage freiwilliges Rückgaberecht für ungetragene Ware." },
  { title: "Bezahlung", text: "Kreditkarte, TWINT und weitere Zahlungsarten über Stripe." },
];

export interface LegalPage {
  title: string;
  updated?: string;
  sections: { heading?: string; paragraphs: string[] }[];
}

const address = `${company.legalName}, ${company.street}, ${company.postalCode} ${company.city}, ${company.country}`;

export const legalPages: Record<string, LegalPage> = {
  impressum: {
    title: "Impressum",
    sections: [
      {
        heading: "Betreiberin dieses Online-Shops",
        paragraphs: [
          company.legalName,
          `${company.street}, ${company.postalCode} ${company.city}, ${company.country}`,
          `E-Mail: ${company.email}`,
          `Telefon: ${company.phone}`,
        ],
      },
      {
        heading: "Handelsregister",
        paragraphs: [
          `Eingetragen im ${company.commercialRegister}`,
          `UID: ${company.uid}`,
          `Vertretungsberechtigte Person: ${company.representative}`,
        ],
      },
      {
        heading: "Haftung für Inhalte und Links",
        paragraphs: [
          "Wir prüfen die Inhalte dieser Website sorgfältig, übernehmen aber keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität. Für Inhalte externer Websites, auf die wir verlinken, sind ausschliesslich deren Betreiber verantwortlich.",
        ],
      },
    ],
  },

  datenschutz: {
    title: "Datenschutzerklärung",
    updated: "[Datum]",
    sections: [
      {
        paragraphs: [
          "Diese Datenschutzerklärung informiert darüber, wie wir Personendaten bearbeiten, wenn du unseren Online-Shop besuchst oder bei uns bestellst. Sie richtet sich nach dem schweizerischen Bundesgesetz über den Datenschutz (DSG).",
        ],
      },
      {
        heading: "1. Verantwortliche Stelle",
        paragraphs: [`${address}. Kontakt für Datenschutzanfragen: ${company.email}.`],
      },
      {
        heading: "2. Welche Daten wir bearbeiten",
        paragraphs: [
          "Bestelldaten: Name, Lieferadresse, E-Mail-Adresse, Telefonnummer und die bestellten Artikel.",
          "Zahlungsdaten: Die Zahlung wickelt Stripe ab. Wir erhalten keine vollständigen Kartendaten, sondern nur die Information, ob und womit bezahlt wurde.",
          "Technische Daten: Beim Aufruf der Website verarbeitet unser Hosting-Anbieter technisch notwendige Daten wie IP-Adresse, Datum und Uhrzeit sowie den Browsertyp in Server-Logfiles.",
          "Warenkorb: Der Inhalt deines Warenkorbs wird nur lokal in deinem Browser gespeichert. Wir setzen keine Cookies für Werbung oder Analyse ein.",
        ],
      },
      {
        heading: "3. Zwecke",
        paragraphs: [
          "Wir bearbeiten diese Daten, um Bestellungen abzuwickeln und zu liefern, dich über den Stand deiner Bestellung zu informieren, Zahlungsbetrug zu verhindern, Anfragen zu beantworten und gesetzliche Pflichten zu erfüllen, insbesondere Aufbewahrungspflichten.",
        ],
      },
      {
        heading: "4. Empfänger und Bekanntgabe ins Ausland",
        paragraphs: [
          "Für den Betrieb des Shops arbeiten wir mit folgenden Dienstleistern zusammen, die Daten in unserem Auftrag oder zur Vertragserfüllung erhalten:",
          "Stripe Payments Europe Ltd. (Irland) und Stripe, Inc. (USA) für die Zahlungsabwicklung.",
          "CJdropshipping (China) als Lieferant: Name, Lieferadresse, Telefonnummer, E-Mail-Adresse und die bestellten Artikel, damit die Ware an dich versendet werden kann.",
          "Die beauftragten Versanddienstleister für die Zustellung.",
          "Vercel Inc. (USA) für das Hosting der Website.",
          "[E-Mail-Dienstleister, z. B. Resend, Inc. (USA)] für den Versand von Bestell- und Versandbestätigungen.",
          "Die USA gelten für Unternehmen, die unter dem Swiss-U.S. Data Privacy Framework zertifiziert sind, als Staat mit angemessenem Datenschutz; sonst stützen wir uns auf Standardvertragsklauseln. China verfügt nicht über ein angemessenes Datenschutzniveau. Die Bekanntgabe an den Lieferanten ist nach Art. 17 Abs. 1 lit. b DSG zulässig, weil sie für die Erfüllung des Kaufvertrags mit dir notwendig ist.",
        ],
      },
      {
        heading: "5. Aufbewahrung",
        paragraphs: [
          "Wir bewahren Bestell- und Buchhaltungsdaten so lange auf, wie es das Gesetz verlangt, in der Regel zehn Jahre (Art. 958f OR). Andere Daten löschen wir, sobald sie für den Zweck nicht mehr nötig sind.",
        ],
      },
      {
        heading: "6. Deine Rechte",
        paragraphs: [
          "Du kannst Auskunft über deine Personendaten verlangen (Art. 25 DSG), deren Berichtigung oder Löschung fordern, der Bearbeitung widersprechen und die Herausgabe deiner Daten in einem gängigen Format verlangen (Art. 28 DSG). Schreibe uns dazu an die oben genannte E-Mail-Adresse.",
          "Du hast ausserdem das Recht, dich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) zu beschweren.",
        ],
      },
      {
        heading: "7. Änderungen",
        paragraphs: ["Wir können diese Datenschutzerklärung anpassen. Es gilt die jeweils hier veröffentlichte Fassung."],
      },
    ],
  },

  agb: {
    title: "Allgemeine Geschäftsbedingungen",
    updated: "[Datum]",
    sections: [
      {
        heading: "1. Geltungsbereich",
        paragraphs: [
          `Diese AGB gelten für alle Bestellungen über den Online-Shop ${shop.name} der ${company.legalName} (nachfolgend «wir»). Wir liefern an Kundinnen und Kunden in ${shipping.countriesLabel}.`,
        ],
      },
      {
        heading: "2. Vertragsschluss",
        paragraphs: [
          "Die Darstellung der Produkte im Shop ist kein verbindliches Angebot. Mit dem Abschluss der Bezahlung gibst du eine verbindliche Bestellung ab. Der Kaufvertrag kommt zustande, wenn wir die Bestellung per E-Mail bestätigen.",
          "Können wir einen Artikel nicht liefern, informieren wir dich umgehend und erstatten bereits bezahlte Beträge vollständig zurück.",
        ],
      },
      {
        heading: "3. Preise",
        paragraphs: [
          company.vatRegistered
            ? `Alle Preise sind Endpreise in Schweizer Franken (CHF) inklusive ${company.vatRate} Mehrwertsteuer.`
            : "Alle Preise sind Endpreise in Schweizer Franken (CHF). Wir sind nicht mehrwertsteuerpflichtig und weisen daher keine Mehrwertsteuer aus.",
          `Die Versandkosten betragen ${shipping.flatLabel} pro Bestellung und entfallen ab einem Bestellwert von ${shipping.freeFromLabel}. Sie werden vor Abschluss der Bestellung angezeigt.`,
        ],
      },
      {
        heading: "4. Zahlung",
        paragraphs: [
          "Die Zahlung erfolgt bei der Bestellung über unseren Zahlungsdienstleister Stripe, zum Beispiel mit Kreditkarte oder TWINT. Die angebotenen Zahlungsarten werden im Bezahlvorgang angezeigt.",
        ],
      },
      {
        heading: "5. Lieferung",
        paragraphs: [
          "Die Ware wird direkt aus dem Lager unseres Lieferanten im Ausland an dich versendet. Die voraussichtliche Lieferzeit steht auf der jeweiligen Produktseite. Bei Bestellungen mit mehreren Artikeln sind Teillieferungen möglich, ohne zusätzliche Versandkosten für dich.",
          "Sobald deine Bestellung versendet wurde, erhältst du eine E-Mail mit der Sendungsnummer.",
        ],
      },
      {
        heading: "6. Zoll und Einfuhrabgaben",
        paragraphs: [
          "[Entscheidung nötig – eine der beiden Varianten wählen:]",
          "[Variante A: Allfällige Zollabgaben, Einfuhrmehrwertsteuer und Gebühren des Zustellers übernehmen wir. Für dich entstehen keine weiteren Kosten.]",
          "[Variante B: Bei Sendungen mit einem Warenwert ab rund CHF 62 können Einfuhrmehrwertsteuer und Verzollungsgebühren des Zustellers anfallen. Diese werden bei der Zustellung erhoben und sind von dir zu tragen.]",
        ],
      },
      {
        heading: "7. Freiwilliges Rückgaberecht",
        paragraphs: [
          "Nach Schweizer Recht besteht bei Online-Käufen kein gesetzliches Widerrufsrecht. Wir gewähren dir freiwillig ein Rückgaberecht von 14 Tagen ab Erhalt der Ware. Die Einzelheiten stehen auf der Seite «Rückgabe».",
        ],
      },
      {
        heading: "8. Gewährleistung",
        paragraphs: [
          "Es gilt die gesetzliche Gewährleistung nach Art. 197 ff. OR. Die Gewährleistungsfrist beträgt zwei Jahre ab Ablieferung der Ware (Art. 210 OR).",
          "Bitte prüfe die Ware nach Erhalt und melde Mängel sofort nach ihrer Entdeckung per E-Mail, wenn möglich mit Fotos (Art. 201 OR). Bei einem berechtigten Mangel liefern wir dir einen gleichwertigen Ersatzartikel oder erstatten den Kaufpreis. Deine weitergehenden gesetzlichen Rechte bleiben vorbehalten.",
        ],
      },
      {
        heading: "9. Haftung",
        paragraphs: [
          "Wir haften für Schäden nur bei Vorsatz und grober Fahrlässigkeit. Die Haftung für leichte Fahrlässigkeit ist im gesetzlich zulässigen Umfang ausgeschlossen (Art. 100 OR). Die Haftung nach dem Produktehaftpflichtgesetz bleibt vorbehalten.",
        ],
      },
      {
        heading: "10. Datenschutz",
        paragraphs: ["Wie wir deine Daten bearbeiten, beschreibt unsere Datenschutzerklärung."],
      },
      {
        heading: "11. Anwendbares Recht und Gerichtsstand",
        paragraphs: [
          "Es gilt schweizerisches Recht unter Ausschluss des UN-Kaufrechts (CISG).",
          `Gerichtsstand ist ${company.city}. Für Konsumentinnen und Konsumenten bleibt der Gerichtsstand an ihrem Wohnsitz vorbehalten (Art. 32 ZPO).`,
        ],
      },
    ],
  },

  rueckgabe: {
    title: "Rückgabe",
    sections: [
      {
        paragraphs: [
          "Nach Schweizer Recht gibt es bei Online-Käufen kein gesetzliches Widerrufsrecht. Wir möchten trotzdem, dass du mit deinem Kauf zufrieden bist, und bieten dir ein freiwilliges Rückgaberecht.",
        ],
      },
      {
        heading: "So funktioniert die Rückgabe",
        paragraphs: [
          "Du kannst Artikel innerhalb von 14 Tagen nach Erhalt zurückgeben, wenn sie ungetragen und unbeschädigt sind und die Etiketten noch dran sind.",
          `Melde die Rückgabe zuerst per E-Mail an ${company.email} mit deiner Bestellnummer. Sende die Ware danach an: ${company.returnAddress}.`,
          "Die Kosten für die Rücksendung trägst du. Nach Eingang und Prüfung der Ware erstatten wir den Kaufpreis innerhalb von 14 Tagen auf das ursprüngliche Zahlungsmittel. Die Versandkosten der Hinsendung erstatten wir nicht.",
        ],
      },
      {
        heading: "Ausgeschlossen",
        paragraphs: [
          "Aus hygienischen Gründen sind Unterwäsche, Bademode und Strumpfwaren von der Rückgabe ausgeschlossen, wenn die Versiegelung entfernt wurde.",
        ],
      },
      {
        heading: "Defekte oder falsche Ware",
        paragraphs: [
          "Hast du einen beschädigten oder falschen Artikel erhalten, schreib uns bitte innerhalb von 7 Tagen nach Erhalt mit Fotos. In diesem Fall musst du nichts zurücksenden, und wir übernehmen alle Kosten.",
        ],
      },
    ],
  },

  versand: {
    title: "Versand und Lieferzeiten",
    sections: [
      {
        heading: "Liefergebiet und Kosten",
        paragraphs: [
          `Wir liefern in ${shipping.countriesLabel}. Der Versand kostet ${shipping.flatLabel}, ab einem Bestellwert von ${shipping.freeFromLabel} ist er kostenlos.`,
        ],
      },
      {
        heading: "Lieferzeit",
        paragraphs: [
          `Unsere Artikel werden direkt aus dem Lager unseres Lieferanten im Ausland verschickt. Die Lieferzeit beträgt in der Regel ${shipping.deliveryLabel} und steht auf jeder Produktseite. Sobald deine Bestellung unterwegs ist, bekommst du eine E-Mail mit der Sendungsnummer.`,
        ],
      },
      {
        heading: "Zoll und Einfuhrabgaben",
        paragraphs: ["[Gleichen Text wie in AGB Ziffer 6 einsetzen, sobald entschieden.]"],
      },
    ],
  },
};
