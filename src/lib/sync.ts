import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  ledgerEntries,
  matches,
  monthLocks,
  seasons,
  syncRuns,
  teams,
} from "@/db/schema";
import { fetchMatches, fetchTeams, type ApiMatch, type ApiTeam } from "./football";
import { monthKey } from "./dates";

const RESULT_COUNTS = ["FINISHED", "AWARDED"] as const;

export type Season = typeof seasons.$inferSelect;

export async function getActiveSeason(): Promise<Season | null> {
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);
  return season ?? null;
}

async function upsertTeams(apiTeams: ApiTeam[]): Promise<Map<number, number>> {
  const byApiId = new Map<number, number>();
  if (apiTeams.length === 0) return byApiId;

  // Hold kan være oprettet i forvejen med et gættet API-id (fx ved manuel opsætning).
  // Vi genkender dem på navnet og retter id'et, så vi ikke får dubletter.
  const existing = await db
    .select({ id: teams.id, apiId: teams.apiId, name: teams.name, tla: teams.tla })
    .from(teams);
  const idByApiId = new Map(existing.map((t) => [t.apiId, t.id]));
  const idByName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
  const idByTla = new Map(
    existing.filter((t) => t.tla).map((t) => [t.tla!.toUpperCase(), t.id]),
  );

  for (const t of apiTeams) {
    const values = {
      apiId: t.id,
      name: t.name,
      shortName: t.shortName ?? t.name,
      tla: t.tla,
      crestUrl: t.crest,
    };

    const existingId =
      idByApiId.get(t.id) ??
      idByName.get(t.name.toLowerCase()) ??
      (t.tla ? idByTla.get(t.tla.toUpperCase()) : undefined);

    if (existingId) {
      await db.update(teams).set(values).where(eq(teams.id, existingId));
      byApiId.set(t.id, existingId);
      continue;
    }

    const [row] = await db
      .insert(teams)
      .values(values)
      .onConflictDoUpdate({
        target: teams.apiId,
        set: {
          name: sql`excluded.name`,
          shortName: sql`excluded.short_name`,
          tla: sql`excluded.tla`,
          crestUrl: sql`excluded.crest_url`,
        },
      })
      .returning({ id: teams.id });
    byApiId.set(t.id, row.id);
  }

  return byApiId;
}

async function upsertMatches(
  seasonId: number,
  apiMatches: ApiMatch[],
  teamIdByApiId: Map<number, number>,
): Promise<number> {
  const values = [];
  for (const m of apiMatches) {
    const homeTeamId = teamIdByApiId.get(m.homeTeam.id);
    const awayTeamId = teamIdByApiId.get(m.awayTeam.id);
    // Hold vi ikke kender (fx en pokalmodstander) springes over frem for at fejle.
    if (!homeTeamId || !awayTeamId) continue;

    values.push({
      apiId: m.id,
      seasonId,
      matchday: m.matchday,
      kickoff: new Date(m.utcDate),
      status: m.status,
      homeTeamId,
      awayTeamId,
      homeGoals: m.score.fullTime.home,
      awayGoals: m.score.fullTime.away,
      lastSyncedAt: new Date(),
    });
  }

  if (values.length === 0) return 0;

  // Postgres tillader højst 65535 parametre pr. sætning — del op for en sikkerheds skyld.
  const CHUNK = 200;
  let count = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    await db
      .insert(matches)
      .values(chunk)
      .onConflictDoUpdate({
        target: matches.apiId,
        set: {
          matchday: sql`excluded.matchday`,
          kickoff: sql`excluded.kickoff`,
          // football-data.org kan midlertidigt glemme et resultat og sende en
          // allerede afsluttet kamp som TIMED uden score. Et bekræftet resultat
          // må ikke nedgraderes af sådan et ufuldstændigt svar. Kommer der et
          // nyt afsluttet resultat, accepteres det stadig som en rettelse.
          status: sql`case
            when ${matches.status} in ('FINISHED', 'AWARDED')
              and excluded.status not in ('FINISHED', 'AWARDED')
            then ${matches.status}
            else excluded.status
          end`,
          homeGoals: sql`case
            when ${matches.status} in ('FINISHED', 'AWARDED')
              and excluded.status not in ('FINISHED', 'AWARDED')
            then ${matches.homeGoals}
            else excluded.home_goals
          end`,
          awayGoals: sql`case
            when ${matches.status} in ('FINISHED', 'AWARDED')
              and excluded.status not in ('FINISHED', 'AWARDED')
            then ${matches.awayGoals}
            else excluded.away_goals
          end`,
          lastSyncedAt: sql`excluded.last_synced_at`,
        },
      });
    count += chunk.length;
  }
  return count;
}

export type RecalcResult = { created: number; updated: number; removed: number; skippedLocked: number };

/**
 * Genberegner alle kampopkrævninger for sæsonen ud fra de spillede kampe.
 * Kampposteringer er afledt data: de kan altid regnes forfra — indtil måneden er lukket.
 * Bøder, betalinger og reguleringer røres aldrig af denne funktion.
 */
export async function recalcCharges(seasonId: number): Promise<RecalcResult> {
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  if (!season) throw new Error("Sæsonen findes ikke.");

  const [assignmentRows, playedMatches, teamRows, existingRows, lockRows] = await Promise.all([
    db
      .select({ teamId: assignments.teamId, memberId: assignments.memberId })
      .from(assignments)
      .where(eq(assignments.seasonId, seasonId)),
    db
      .select()
      .from(matches)
      .where(and(eq(matches.seasonId, seasonId), inArray(matches.status, [...RESULT_COUNTS]))),
    db.select({ id: teams.id, shortName: teams.shortName }).from(teams),
    db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.seasonId, seasonId), eq(ledgerEntries.type, "match"))),
    db
      .select({ monthKey: monthLocks.monthKey })
      .from(monthLocks)
      .where(eq(monthLocks.seasonId, seasonId)),
  ]);

  const membersByTeam = new Map<number, number[]>();
  for (const row of assignmentRows) {
    const list = membersByTeam.get(row.teamId) ?? [];
    list.push(row.memberId);
    membersByTeam.set(row.teamId, list);
  }
  const nameByTeam = new Map(teamRows.map((t) => [t.id, t.shortName]));
  const lockedMonths = new Set(lockRows.map((l) => l.monthKey));

  type Desired = {
    matchId: number;
    teamId: number;
    memberId: number;
    amountOre: number;
    occurredAt: Date;
    description: string;
  };

  const desired = new Map<string, Desired>();

  for (const match of playedMatches) {
    if (match.homeGoals === null || match.awayGoals === null) continue;

    const home = nameByTeam.get(match.homeTeamId) ?? "?";
    const away = nameByTeam.get(match.awayTeamId) ?? "?";
    const scoreline = `${home} ${match.homeGoals}-${match.awayGoals} ${away}`;

    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
      const own = side === "home" ? match.homeGoals : match.awayGoals;
      const other = side === "home" ? match.awayGoals : match.homeGoals;

      const owners = membersByTeam.get(teamId) ?? [];
      if (owners.length === 0) continue;

      let amountOre = 0;
      let label = "";
      if (own === other) {
        amountOre = season.drawFeeOre;
        label = "Uafgjort";
      } else if (own < other) {
        amountOre = season.lossFeeOre;
        label = "Nederlag";
      }
      if (amountOre <= 0) continue;

      // Deler flere medlemmer et hold, betaler de hver især.
      for (const memberId of owners) {
        desired.set(`${match.id}:${teamId}:${memberId}`, {
          matchId: match.id,
          teamId,
          memberId,
          amountOre,
          occurredAt: match.kickoff,
          description: `${label}: ${scoreline}`,
        });
      }
    }
  }

  const existingByKey = new Map(
    existingRows.map((e) => [`${e.matchId}:${e.teamId}:${e.memberId}`, e]),
  );
  const result: RecalcResult = { created: 0, updated: 0, removed: 0, skippedLocked: 0 };

  for (const [key, want] of desired) {
    const current = existingByKey.get(key);
    const locked = lockedMonths.has(monthKey(want.occurredAt));

    if (!current) {
      if (locked) {
        result.skippedLocked += 1;
        continue;
      }
      await db
        .insert(ledgerEntries)
        .values({
          seasonId,
          memberId: want.memberId,
          type: "match",
          amountOre: want.amountOre,
          occurredAt: want.occurredAt,
          description: want.description,
          matchId: want.matchId,
          teamId: want.teamId,
        })
        .onConflictDoNothing();
      result.created += 1;
      continue;
    }

    const unchanged =
      current.amountOre === want.amountOre &&
      current.description === want.description &&
      current.occurredAt.getTime() === want.occurredAt.getTime();

    if (unchanged) continue;

    if (locked || lockedMonths.has(monthKey(current.occurredAt))) {
      result.skippedLocked += 1;
      continue;
    }

    await db
      .update(ledgerEntries)
      .set({
        amountOre: want.amountOre,
        description: want.description,
        occurredAt: want.occurredAt,
      })
      .where(eq(ledgerEntries.id, current.id));
    result.updated += 1;
  }

  // Kampe der er blevet udsat, annulleret eller fået rettet resultat mister deres postering.
  const staleIds: number[] = [];
  for (const [key, entry] of existingByKey) {
    if (desired.has(key)) continue;
    if (lockedMonths.has(monthKey(entry.occurredAt))) {
      result.skippedLocked += 1;
      continue;
    }
    staleIds.push(entry.id);
  }
  if (staleIds.length > 0) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.id, staleIds));
    result.removed = staleIds.length;
  }

  return result;
}

export type SyncResult = {
  matchesUpserted: number;
  recalc: RecalcResult;
};

/** Hele kæden: hent hold og kampe fra API'et, gem dem, og genberegn pengene. */
export async function runSync(trigger: string): Promise<SyncResult> {
  const season = await getActiveSeason();
  if (!season) throw new Error("Ingen aktiv sæson er valgt.");

  const [run] = await db.insert(syncRuns).values({ trigger }).returning({ id: syncRuns.id });

  try {
    const apiTeams = await fetchTeams(season.competitionCode, season.apiSeasonYear);
    const teamIdByApiId = await upsertTeams(apiTeams);

    const apiMatches = await fetchMatches(season.competitionCode, season.apiSeasonYear);
    const matchesUpserted = await upsertMatches(season.id, apiMatches, teamIdByApiId);

    const recalc = await recalcCharges(season.id);

    await db
      .update(syncRuns)
      .set({
        finishedAt: new Date(),
        matchesUpserted,
        entriesCreated: recalc.created,
      })
      .where(eq(syncRuns.id, run.id));

    return { matchesUpserted, recalc };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), error: message })
      .where(eq(syncRuns.id, run.id));
    throw error;
  }
}
