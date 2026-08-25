/**
 * Opretter sæson, hold, medlemmer og holdfordeling i den database DATABASE_URL peger på.
 * Sletter intet: kan køres igen uden at ødelægge posteringer.
 *
 *   node --env-file=.env.production.local ./node_modules/.bin/tsx scripts/roster.ts
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { assignments, fineTypes, members, seasons, teams } from "../src/db/schema";
import { DEFAULT_FINE_TYPES, PL_TEAMS, ROSTER, newLoginCode } from "./roster-data";

async function main() {
  let [season] = await db.select().from(seasons).where(eq(seasons.isActive, true)).limit(1);

  if (!season) {
    [season] = await db
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
    console.log(`Sæson oprettet: ${season.name}`);
  } else {
    console.log(`Sæson findes: ${season.name}`);
  }

  // Holdene får gættede API-id'er indtil den første synkronisering. Den genkender
  // dem på navn og trebogstavskode og retter id'erne, så der ikke opstår dubletter.
  const existingTeams = await db.select().from(teams);
  const teamIdByShortName = new Map(existingTeams.map((t) => [t.shortName, t.id]));

  for (const team of PL_TEAMS) {
    if (teamIdByShortName.has(team.shortName)) continue;
    const [row] = await db.insert(teams).values(team).onConflictDoNothing().returning();
    if (row) teamIdByShortName.set(team.shortName, row.id);
  }
  console.log(`Hold i databasen: ${teamIdByShortName.size}`);

  const existingMembers = await db.select().from(members);
  const memberIdByName = new Map(existingMembers.map((m) => [m.name, m.id]));
  const codes: { name: string; code: string; isAdmin: boolean }[] = [];

  for (const person of ROSTER) {
    let memberId = memberIdByName.get(person.name);

    if (!memberId) {
      const code = newLoginCode();
      const [row] = await db
        .insert(members)
        .values({ name: person.name, loginCode: code, isAdmin: person.isAdmin ?? false })
        .returning();
      memberId = row.id;
      memberIdByName.set(person.name, memberId);
      codes.push({ name: person.name, code, isAdmin: row.isAdmin });
    } else {
      const existing = existingMembers.find((m) => m.id === memberId)!;
      codes.push({ name: person.name, code: existing.loginCode, isAdmin: existing.isAdmin });
    }

    const teamIds = person.teams.map((shortName) => {
      const id = teamIdByShortName.get(shortName);
      if (!id) throw new Error(`Ukendt hold i fordelingen: ${shortName}`);
      return id;
    });

    await db
      .delete(assignments)
      .where(and(eq(assignments.seasonId, season.id), eq(assignments.memberId, memberId)));
    await db
      .insert(assignments)
      .values([...new Set(teamIds)].map((teamId) => ({ seasonId: season.id, memberId, teamId })));
  }

  const existingFines = await db
    .select()
    .from(fineTypes)
    .where(eq(fineTypes.seasonId, season.id));
  if (existingFines.length === 0) {
    await db
      .insert(fineTypes)
      .values(DEFAULT_FINE_TYPES.map((f) => ({ ...f, seasonId: season.id })));
    console.log("Bødetyper oprettet.");
  }

  console.log("\nLoginkoder:");
  for (const entry of codes) {
    console.log(`  ${entry.name.padEnd(12)} ${entry.code}${entry.isAdmin ? "  (admin)" : ""}`);
  }
  console.log("\nFærdig.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
