/**
 * Testdata til lokal udvikling: en sæson, 20 hold, 10 medlemmer og et par spillede runder.
 * Bruges indtil vi har en API-nøgle og kan hente rigtige kampe.
 * Kører kun mod en lokal database, medmindre man skriver --force.
 */
import { db } from "../src/db";
import {
  assignments,
  fineTypes,
  ledgerEntries,
  matches,
  members,
  monthLocks,
  payouts,
  seasons,
  syncRuns,
  teams,
} from "../src/db/schema";
import { recalcCharges } from "../src/lib/sync";

const url = process.env.DATABASE_URL ?? "";
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
if (!isLocal && !process.argv.includes("--force")) {
  console.error("Nægter at seede en fjerndatabase. Tilføj --force hvis du er sikker.");
  process.exit(1);
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20262027);

const PL_TEAMS = [
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

/** Logens fordeling 2026/27. Flere kan have det samme hold. */
const ROSTER: { name: string; isAdmin?: boolean; teams: [string, string] }[] = [
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

function code(): string {
  // Uden I, O, 0 og 1, så koder kan læses op uden tvivl.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let n = 0; n < 6; n++) out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

async function main() {
  console.log("Rydder databasen ...");
  await db.delete(ledgerEntries);
  await db.delete(payouts);
  await db.delete(monthLocks);
  await db.delete(matches);
  await db.delete(assignments);
  await db.delete(fineTypes);
  await db.delete(syncRuns);
  await db.delete(members);
  await db.delete(teams);
  await db.delete(seasons);

  const [season] = await db
    .insert(seasons)
    .values({
      name: "2026/27",
      competitionCode: "PL",
      apiSeasonYear: 2026,
      drawFeeOre: 2500,
      lossFeeOre: 5000,
      isActive: true,
    })
    .returning();
  console.log(`Sæson: ${season.name}`);

  const teamRows = await db.insert(teams).values(PL_TEAMS).returning();

  const memberRows = await db
    .insert(members)
    .values(
      ROSTER.map((m) => ({
        name: m.name,
        loginCode: code(),
        isAdmin: m.isAdmin ?? false,
      })),
    )
    .returning();

  const teamIdByShortName = new Map(teamRows.map((t) => [t.shortName, t.id]));
  const assignmentValues = [];
  for (let i = 0; i < ROSTER.length; i++) {
    for (const shortName of ROSTER[i].teams) {
      const teamId = teamIdByShortName.get(shortName);
      if (!teamId) throw new Error(`Ukendt hold i fordelingen: ${shortName}`);
      assignmentValues.push({ seasonId: season.id, memberId: memberRows[i].id, teamId });
    }
  }
  await db.insert(assignments).values(assignmentValues);

  // Fire spillede runder i august/september plus én kommende runde.
  const PLAYED_ROUNDS = 4;
  const matchValues = [];
  let apiId = 500000;
  for (let matchday = 1; matchday <= PLAYED_ROUNDS + 1; matchday++) {
    const shuffled = [...teamRows].sort(() => rand() - 0.5);
    const kickoffBase = new Date(Date.UTC(2026, 7, 15 + (matchday - 1) * 7, 13, 0, 0));
    for (let i = 0; i < shuffled.length; i += 2) {
      const played = matchday <= PLAYED_ROUNDS;
      const postponed = matchday === 3 && i === 0;
      matchValues.push({
        apiId: apiId++,
        seasonId: season.id,
        matchday,
        kickoff: new Date(kickoffBase.getTime() + (i / 2) * 2 * 60 * 60 * 1000),
        status: postponed ? "POSTPONED" : played ? "FINISHED" : "TIMED",
        homeTeamId: shuffled[i].id,
        awayTeamId: shuffled[i + 1].id,
        homeGoals: played && !postponed ? Math.floor(rand() * 4) : null,
        awayGoals: played && !postponed ? Math.floor(rand() * 4) : null,
        lastSyncedAt: new Date(),
      });
    }
  }
  await db.insert(matches).values(matchValues);

  await db.insert(fineTypes).values([
    { seasonId: season.id, name: "For sent til lodtrækningen", defaultAmountOre: 10000, sortOrder: 1 },
    { seasonId: season.id, name: "Betalt for sent", defaultAmountOre: 5000, sortOrder: 2 },
    { seasonId: season.id, name: "Udeblevet fra kampaften", defaultAmountOre: 7500, sortOrder: 3 },
  ]);

  const recalc = await recalcCharges(season.id);
  console.log(`Kampopkrævninger: ${recalc.created} oprettet`);

  // Et par manuelle posteringer, så admin-siderne har noget at vise.
  await db.insert(ledgerEntries).values([
    {
      seasonId: season.id,
      memberId: memberRows[1].id,
      type: "fine",
      amountOre: 10000,
      occurredAt: new Date(Date.UTC(2026, 7, 20, 18, 0, 0)),
      description: "For sent til lodtrækningen",
      createdByMemberId: memberRows[0].id,
    },
    {
      seasonId: season.id,
      memberId: memberRows[2].id,
      type: "payment",
      amountOre: -25000,
      occurredAt: new Date(Date.UTC(2026, 8, 1, 10, 0, 0)),
      description: "Indbetaling",
      paymentMethod: "MobilePay",
      createdByMemberId: memberRows[0].id,
    },
    {
      seasonId: season.id,
      memberId: memberRows[3].id,
      type: "payment",
      amountOre: -15000,
      occurredAt: new Date(Date.UTC(2026, 8, 2, 10, 0, 0)),
      description: "Indbetaling",
      paymentMethod: "Bankoverførsel",
      createdByMemberId: memberRows[0].id,
    },
  ]);

  console.log("\nLoginkoder:");
  for (const m of memberRows) {
    console.log(`  ${m.name.padEnd(12)} ${m.loginCode}${m.isAdmin ? "  (admin)" : ""}`);
  }
  console.log("\nFærdig.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
