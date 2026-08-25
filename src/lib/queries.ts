import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  ledgerEntries,
  matches,
  fineTypes,
  members,
  monthLocks,
  payouts,
  seasons,
  syncRuns,
  teams,
} from "@/db/schema";
import { TZ } from "./dates";

/** Måneden en postering hører til, beregnet i dansk tid inde i databasen. */
const monthKeySql = sql<string>`to_char(${ledgerEntries.occurredAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM')`;

export type TeamRef = {
  id: number;
  name: string;
  shortName: string;
  tla: string | null;
  crestUrl: string | null;
};

export type MemberStanding = {
  memberId: number;
  name: string;
  teams: TeamRef[];
  matchOre: number;
  fineOre: number;
  adjustmentOre: number;
  paidOre: number;
  balanceOre: number;
};

export async function getSeasonList() {
  return db.select().from(seasons).orderBy(desc(seasons.apiSeasonYear));
}

export async function getTeamsByMember(seasonId: number): Promise<Map<number, TeamRef[]>> {
  const rows = await db
    .select({
      memberId: assignments.memberId,
      id: teams.id,
      name: teams.name,
      shortName: teams.shortName,
      tla: teams.tla,
      crestUrl: teams.crestUrl,
    })
    .from(assignments)
    .innerJoin(teams, eq(teams.id, assignments.teamId))
    .where(eq(assignments.seasonId, seasonId))
    .orderBy(asc(teams.shortName));

  const map = new Map<number, TeamRef[]>();
  for (const row of rows) {
    const list = map.get(row.memberId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      tla: row.tla,
      crestUrl: row.crestUrl,
    });
    map.set(row.memberId, list);
  }
  return map;
}

export async function getStandings(seasonId: number): Promise<MemberStanding[]> {
  const [memberRows, totals, teamsByMember] = await Promise.all([
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.isActive, true))
      .orderBy(asc(members.name)),
    db
      .select({
        memberId: ledgerEntries.memberId,
        type: ledgerEntries.type,
        total: sql<number>`coalesce(sum(${ledgerEntries.amountOre}), 0)::int`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seasonId, seasonId))
      .groupBy(ledgerEntries.memberId, ledgerEntries.type),
    getTeamsByMember(seasonId),
  ]);

  const standings = new Map<number, MemberStanding>(
    memberRows.map((m) => [
      m.id,
      {
        memberId: m.id,
        name: m.name,
        teams: teamsByMember.get(m.id) ?? [],
        matchOre: 0,
        fineOre: 0,
        adjustmentOre: 0,
        paidOre: 0,
        balanceOre: 0,
      },
    ]),
  );

  for (const row of totals) {
    const standing = standings.get(row.memberId);
    if (!standing) continue;
    if (row.type === "match") standing.matchOre += row.total;
    else if (row.type === "fine") standing.fineOre += row.total;
    else if (row.type === "adjustment") standing.adjustmentOre += row.total;
    else if (row.type === "payment") standing.paidOre += -row.total;
    standing.balanceOre += row.total;
  }

  return [...standings.values()].sort(
    (a, b) => b.matchOre + b.fineOre - (a.matchOre + a.fineOre) || a.name.localeCompare(b.name, "da"),
  );
}

export type PotSummary = {
  paidInOre: number;
  paidOutOre: number;
  potOre: number;
  chargedOre: number;
  outstandingOre: number;
  memberCount: number;
};

export async function getPotSummary(seasonId: number): Promise<PotSummary> {
  const [ledgerTotals, payoutTotal, memberCount] = await Promise.all([
    db
      .select({
        type: ledgerEntries.type,
        total: sql<number>`coalesce(sum(${ledgerEntries.amountOre}), 0)::int`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seasonId, seasonId))
      .groupBy(ledgerEntries.type),
    db
      .select({ total: sql<number>`coalesce(sum(${payouts.amountOre}), 0)::int` })
      .from(payouts)
      .where(eq(payouts.seasonId, seasonId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(members)
      .where(eq(members.isActive, true)),
  ]);

  let paidInOre = 0;
  let chargedOre = 0;
  for (const row of ledgerTotals) {
    if (row.type === "payment") paidInOre += -row.total;
    else chargedOre += row.total;
  }

  const paidOutOre = payoutTotal[0]?.total ?? 0;

  return {
    paidInOre,
    paidOutOre,
    potOre: paidInOre - paidOutOre,
    chargedOre,
    outstandingOre: chargedOre - paidInOre,
    memberCount: memberCount[0]?.count ?? 0,
  };
}

export type MonthSummary = {
  monthKey: string;
  chargedOre: number;
  paidOre: number;
  locked: boolean;
};

export async function getMonthlySummary(seasonId: number): Promise<MonthSummary[]> {
  const [rows, locks] = await Promise.all([
    db
      .select({
        monthKey: monthKeySql,
        type: ledgerEntries.type,
        total: sql<number>`coalesce(sum(${ledgerEntries.amountOre}), 0)::int`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seasonId, seasonId))
      .groupBy(monthKeySql, ledgerEntries.type),
    getLockedMonths(seasonId),
  ]);

  const byMonth = new Map<string, MonthSummary>();
  for (const row of rows) {
    const entry = byMonth.get(row.monthKey) ?? {
      monthKey: row.monthKey,
      chargedOre: 0,
      paidOre: 0,
      locked: locks.has(row.monthKey),
    };
    if (row.type === "payment") entry.paidOre += -row.total;
    else entry.chargedOre += row.total;
    byMonth.set(row.monthKey, entry);
  }

  return [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export async function getLockedMonths(seasonId: number): Promise<Set<string>> {
  const rows = await db
    .select({ monthKey: monthLocks.monthKey })
    .from(monthLocks)
    .where(eq(monthLocks.seasonId, seasonId));
  return new Set(rows.map((r) => r.monthKey));
}

export type LedgerRow = {
  id: number;
  type: "match" | "fine" | "payment" | "adjustment";
  amountOre: number;
  occurredAt: Date;
  description: string;
  note: string | null;
  paymentMethod: string | null;
  teamShortName: string | null;
  matchday: number | null;
  reversesEntryId: number | null;
};

export async function getMemberEntries(
  seasonId: number,
  memberId: number,
): Promise<LedgerRow[]> {
  return db
    .select({
      id: ledgerEntries.id,
      type: ledgerEntries.type,
      amountOre: ledgerEntries.amountOre,
      occurredAt: ledgerEntries.occurredAt,
      description: ledgerEntries.description,
      note: ledgerEntries.note,
      paymentMethod: ledgerEntries.paymentMethod,
      teamShortName: teams.shortName,
      matchday: matches.matchday,
      reversesEntryId: ledgerEntries.reversesEntryId,
    })
    .from(ledgerEntries)
    .leftJoin(teams, eq(teams.id, ledgerEntries.teamId))
    .leftJoin(matches, eq(matches.id, ledgerEntries.matchId))
    .where(and(eq(ledgerEntries.seasonId, seasonId), eq(ledgerEntries.memberId, memberId)))
    .orderBy(desc(ledgerEntries.occurredAt), desc(ledgerEntries.id));
}

export type TeamCost = {
  teamId: number;
  shortName: string;
  crestUrl: string | null;
  owners: string[];
  totalOre: number;
  draws: number;
  losses: number;
};

export async function getTeamCosts(seasonId: number): Promise<TeamCost[]> {
  const [rows, ownerRows] = await Promise.all([
    db
      .select({
        teamId: teams.id,
        shortName: teams.shortName,
        crestUrl: teams.crestUrl,
        totalOre: sql<number>`coalesce(sum(${ledgerEntries.amountOre}), 0)::int`,
        // Deles et hold af flere, tælles kampen stadig kun én gang.
        draws: sql<number>`count(distinct ${ledgerEntries.matchId}) filter (where ${ledgerEntries.description} like 'Uafgjort%')::int`,
        losses: sql<number>`count(distinct ${ledgerEntries.matchId}) filter (where ${ledgerEntries.description} like 'Nederlag%')::int`,
      })
      .from(teams)
      .innerJoin(
        assignments,
        and(eq(assignments.teamId, teams.id), eq(assignments.seasonId, seasonId)),
      )
      .leftJoin(
        ledgerEntries,
        and(
          eq(ledgerEntries.teamId, teams.id),
          eq(ledgerEntries.seasonId, seasonId),
          eq(ledgerEntries.type, "match"),
        ),
      )
      .groupBy(teams.id, teams.shortName, teams.crestUrl),
    db
      .select({ teamId: assignments.teamId, name: members.name })
      .from(assignments)
      .innerJoin(members, eq(members.id, assignments.memberId))
      .where(eq(assignments.seasonId, seasonId))
      .orderBy(asc(members.name)),
  ]);

  const ownersByTeam = new Map<number, string[]>();
  for (const row of ownerRows) {
    const list = ownersByTeam.get(row.teamId) ?? [];
    list.push(row.name);
    ownersByTeam.set(row.teamId, list);
  }

  return rows
    .map((r) => ({ ...r, owners: ownersByTeam.get(r.teamId) ?? [] }))
    .sort((a, b) => b.totalOre - a.totalOre || a.shortName.localeCompare(b.shortName, "da"));
}

export type MatchRow = {
  id: number;
  matchday: number | null;
  kickoff: Date;
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  charges: { memberId: number; memberName: string; teamId: number; amountOre: number }[];
};

export async function getMatchdays(seasonId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ matchday: matches.matchday })
    .from(matches)
    .where(eq(matches.seasonId, seasonId))
    .orderBy(asc(matches.matchday));
  return rows.map((r) => r.matchday).filter((m): m is number => m !== null);
}

/** Den seneste runde hvor mindst én kamp er spillet — det folk vil se når de åbner siden. */
export async function getLatestPlayedMatchday(seasonId: number): Promise<number | null> {
  const [row] = await db
    .select({ matchday: sql<number | null>`max(${matches.matchday})` })
    .from(matches)
    .where(and(eq(matches.seasonId, seasonId), inArray(matches.status, ["FINISHED", "AWARDED"])));
  return row?.matchday ?? null;
}

export async function getMatchesForMatchday(
  seasonId: number,
  matchday: number,
): Promise<MatchRow[]> {
  const rows = await db.execute<{
    id: number;
    matchday: number | null;
    kickoff: Date;
    status: string;
    home_goals: number | null;
    away_goals: number | null;
    home_id: number;
    home_name: string;
    home_short: string;
    home_tla: string | null;
    home_crest: string | null;
    away_id: number;
    away_name: string;
    away_short: string;
    away_tla: string | null;
    away_crest: string | null;
  }>(sql`
    select m.id, m.matchday, m.kickoff, m.status, m.home_goals, m.away_goals,
           h.id as home_id, h.name as home_name, h.short_name as home_short, h.tla as home_tla, h.crest_url as home_crest,
           a.id as away_id, a.name as away_name, a.short_name as away_short, a.tla as away_tla, a.crest_url as away_crest
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where m.season_id = ${seasonId} and m.matchday = ${matchday}
    order by m.kickoff asc, h.short_name asc
  `);

  const matchIds = rows.map((r) => r.id);
  const chargeRows =
    matchIds.length === 0
      ? []
      : await db
          .select({
            matchId: ledgerEntries.matchId,
            teamId: ledgerEntries.teamId,
            amountOre: ledgerEntries.amountOre,
            memberId: members.id,
            memberName: members.name,
          })
          .from(ledgerEntries)
          .innerJoin(members, eq(members.id, ledgerEntries.memberId))
          .where(
            and(
              eq(ledgerEntries.type, "match"),
              inArray(ledgerEntries.matchId, matchIds),
            ),
          );

  const chargesByMatch = new Map<number, MatchRow["charges"]>();
  for (const c of chargeRows) {
    if (c.matchId === null || c.teamId === null) continue;
    const list = chargesByMatch.get(c.matchId) ?? [];
    list.push({
      memberId: c.memberId,
      memberName: c.memberName,
      teamId: c.teamId,
      amountOre: c.amountOre,
    });
    chargesByMatch.set(c.matchId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    matchday: r.matchday,
    kickoff: new Date(r.kickoff),
    status: r.status,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    homeTeam: {
      id: r.home_id,
      name: r.home_name,
      shortName: r.home_short,
      tla: r.home_tla,
      crestUrl: r.home_crest,
    },
    awayTeam: {
      id: r.away_id,
      name: r.away_name,
      shortName: r.away_short,
      tla: r.away_tla,
      crestUrl: r.away_crest,
    },
    charges: chargesByMatch.get(r.id) ?? [],
  }));
}

/* --------------------------------------------------------------- admin-opslag */

export async function getMemberList() {
  return db
    .select({
      id: members.id,
      name: members.name,
      loginCode: members.loginCode,
      isAdmin: members.isAdmin,
      isActive: members.isActive,
    })
    .from(members)
    .orderBy(asc(members.name));
}

export async function getActiveMemberOptions() {
  return db
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(eq(members.isActive, true))
    .orderBy(asc(members.name));
}

export async function getAllTeams() {
  return db
    .select({ id: teams.id, shortName: teams.shortName, name: teams.name })
    .from(teams)
    .orderBy(asc(teams.shortName));
}

export async function getFineTypes(seasonId: number) {
  return db
    .select({
      id: fineTypes.id,
      name: fineTypes.name,
      defaultAmountOre: fineTypes.defaultAmountOre,
    })
    .from(fineTypes)
    .where(and(eq(fineTypes.seasonId, seasonId), eq(fineTypes.isActive, true)))
    .orderBy(asc(fineTypes.sortOrder), asc(fineTypes.name));
}

export async function getPayouts(seasonId: number) {
  return db
    .select()
    .from(payouts)
    .where(eq(payouts.seasonId, seasonId))
    .orderBy(desc(payouts.occurredAt));
}

export type ManualEntry = {
  id: number;
  memberName: string;
  type: "match" | "fine" | "payment" | "adjustment";
  amountOre: number;
  occurredAt: Date;
  description: string;
  paymentMethod: string | null;
  note: string | null;
  reversesEntryId: number | null;
};

/** De seneste posteringer admin selv har lavet — kampopkrævninger er ikke med. */
export async function getRecentManualEntries(
  seasonId: number,
  limit = 25,
): Promise<ManualEntry[]> {
  return db
    .select({
      id: ledgerEntries.id,
      memberName: members.name,
      type: ledgerEntries.type,
      amountOre: ledgerEntries.amountOre,
      occurredAt: ledgerEntries.occurredAt,
      description: ledgerEntries.description,
      paymentMethod: ledgerEntries.paymentMethod,
      note: ledgerEntries.note,
      reversesEntryId: ledgerEntries.reversesEntryId,
    })
    .from(ledgerEntries)
    .innerJoin(members, eq(members.id, ledgerEntries.memberId))
    .where(
      and(
        eq(ledgerEntries.seasonId, seasonId),
        inArray(ledgerEntries.type, ["fine", "payment", "adjustment"]),
      ),
    )
    .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
    .limit(limit);
}

export async function getSyncRuns(limit = 8) {
  return db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit);
}

export async function getAssignmentsByMember(seasonId: number): Promise<Map<number, number[]>> {
  const rows = await db
    .select({ memberId: assignments.memberId, teamId: assignments.teamId })
    .from(assignments)
    .where(eq(assignments.seasonId, seasonId));

  const map = new Map<number, number[]>();
  for (const row of rows) {
    const list = map.get(row.memberId) ?? [];
    list.push(row.teamId);
    map.set(row.memberId, list);
  }
  return map;
}

export async function getMemberById(id: number) {
  const [member] = await db
    .select({ id: members.id, name: members.name, isActive: members.isActive })
    .from(members)
    .where(eq(members.id, id))
    .limit(1);
  return member ?? null;
}
