/** Alle beløb regnes i øre. Visning sker altid i danske kroner. */

const krFormatter = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const krFormatterDecimals = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 5000 -> "50 kr", 5050 -> "50,50 kr" */
export function formatOre(ore: number): string {
  // Uden dette bliver negativt nul vist som "-0 kr".
  const kr = ore === 0 ? 0 : ore / 100;
  const body = ore % 100 === 0 ? krFormatter.format(kr) : krFormatterDecimals.format(kr);
  return `${body} kr`;
}

/** Som formatOre, men uden enhed — til tabelkolonner med egen overskrift. */
export function formatOreBare(ore: number): string {
  const kr = ore === 0 ? 0 : ore / 100;
  return ore % 100 === 0 ? krFormatter.format(kr) : krFormatterDecimals.format(kr);
}

/** Accepterer "25", "25,50" og "25.50". Returnerer null ved ugyldigt input. */
export function parseKrToOre(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(/kr\.?$/i, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
