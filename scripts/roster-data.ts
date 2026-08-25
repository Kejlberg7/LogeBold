/** Premier League 2026/27 og logens fordeling. Deles af seed og roster. */

export const PL_TEAMS = [
  { apiId: 57, name: "Arsenal FC", shortName: "Arsenal", tla: "ARS" },
  { apiId: 58, name: "Aston Villa FC", shortName: "Aston Villa", tla: "AVL" },
  { apiId: 1044, name: "AFC Bournemouth", shortName: "Bournemouth", tla: "BOU" },
  { apiId: 402, name: "Brentford FC", shortName: "Brentford", tla: "BRE" },
  { apiId: 397, name: "Brighton & Hove Albion FC", shortName: "Brighton", tla: "BHA" },
  { apiId: 61, name: "Chelsea FC", shortName: "Chelsea", tla: "CHE" },
  { apiId: 1076, name: "Coventry City FC", shortName: "Coventry", tla: "COV" },
  { apiId: 354, name: "Crystal Palace FC", shortName: "Crystal Palace", tla: "CRY" },
  { apiId: 62, name: "Everton FC", shortName: "Everton", tla: "EVE" },
  { apiId: 63, name: "Fulham FC", shortName: "Fulham", tla: "FUL" },
  { apiId: 322, name: "Hull City AFC", shortName: "Hull", tla: "HUL" },
  { apiId: 349, name: "Ipswich Town FC", shortName: "Ipswich", tla: "IPS" },
  { apiId: 341, name: "Leeds United FC", shortName: "Leeds", tla: "LEE" },
  { apiId: 64, name: "Liverpool FC", shortName: "Liverpool", tla: "LIV" },
  { apiId: 65, name: "Manchester City FC", shortName: "Man City", tla: "MCI" },
  { apiId: 66, name: "Manchester United FC", shortName: "Man United", tla: "MUN" },
  { apiId: 67, name: "Newcastle United FC", shortName: "Newcastle", tla: "NEW" },
  { apiId: 351, name: "Nottingham Forest FC", shortName: "Nottingham", tla: "NFO" },
  { apiId: 71, name: "Sunderland AFC", shortName: "Sunderland", tla: "SUN" },
  { apiId: 73, name: "Tottenham Hotspur FC", shortName: "Tottenham", tla: "TOT" },
];

/**
 * Logens fordeling 2026/27. Flere medlemmer kan have det samme hold — de betaler
 * hver især. Liverpool og Man United er ikke trukket af nogen.
 */
export const ROSTER: { name: string; isAdmin?: boolean; teams: [string, string] }[] = [
  { name: "Ib", teams: ["Chelsea", "Everton"] },
  { name: "Alex", teams: ["Arsenal", "Leeds"] },
  { name: "Kejlberg", isAdmin: true, teams: ["Coventry", "Tottenham"] },
  { name: "Kapper", teams: ["Brighton", "Nottingham"] },
  { name: "Carl", teams: ["Man City", "Crystal Palace"] },
  { name: "Peter F", teams: ["Brentford", "Ipswich"] },
  { name: "Mulle", teams: ["Hull", "Nottingham"] },
  { name: "Nico", teams: ["Coventry", "Tottenham"] },
  { name: "Toby", teams: ["Fulham", "Crystal Palace"] },
  { name: "Børner", teams: ["Everton", "Aston Villa"] },
  { name: "Asbech", teams: ["Sunderland", "Newcastle"] },
  { name: "Emir", teams: ["Tottenham", "Hull"] },
  { name: "Mads G", teams: ["Sunderland", "Brentford"] },
  { name: "Mads P", teams: ["Arsenal", "Bournemouth"] },
  { name: "Crell", teams: ["Tottenham", "Bournemouth"] },
];

export const DEFAULT_FINE_TYPES = [
  { name: "For sent til lodtrækningen", defaultAmountOre: 10000, sortOrder: 1 },
  { name: "Betalt for sent", defaultAmountOre: 5000, sortOrder: 2 },
  { name: "Udeblevet fra kampaften", defaultAmountOre: 7500, sortOrder: 3 },
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Uden I, O, 0 og 1, så koder kan læses op uden tvivl. */
export function newLoginCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}
