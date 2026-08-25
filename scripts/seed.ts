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
import { DEFAULT_FINE_TYPES, PL_TEAMS, ROSTER, newLoginCode } from "./roster-data";

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
        loginCode: newLoginCode(),
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

  await db
    .insert(fineTypes)
    .values(DEFAULT_FINE_TYPES.map((f) => ({ ...f, seasonId: season.id })));

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
