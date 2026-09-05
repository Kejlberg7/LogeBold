import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
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
import { TZ, currentMonthKey } from "./dates";

/**
 * Måneden en postering opkræves i. Normalt sat eksplicit ved oprettelsen — for
 * kampe efter runden, ikke efter kickoff — ellers falder vi tilbage til datoen
 * beregnet i dansk tid, sådan som posteringer fra før feltet fandtes læses.
 */
const monthKeySql = sql<string>`coalesce(${ledgerEntries.billingMonth}, to_char(${ledgerEntries.occurredAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM'))`;

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
  billingMonth: string | null;
  matchId: number | null;
  teamId: number | null;
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
      billingMonth: ledgerEntries.billingMonth,
      matchId: ledgerEntries.matchId,
      teamId: ledgerEntries.teamId,
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
  owners: { memberId: number; name: string }[];
  totalOre: number;
  draws: number;
  losses: number;
};

export async function getTeamCosts(seasonId: number): Promise<TeamCost[]> {
  // Ejere og posteringer hentes hver for sig. Slås de sammen i én forespørgsel,
  // ganges beløbet med antallet af ejere — et hold med fire ejere ville vise
  // fire gange for meget.
  const [teamRows, ledgerRows, ownerRows] = await Promise.all([
    db
      .selectDistinct({
        teamId: teams.id,
        shortName: teams.shortName,
        crestUrl: teams.crestUrl,
      })
      .from(teams)
      .innerJoin(
        assignments,
        and(eq(assignments.teamId, teams.id), eq(assignments.seasonId, seasonId)),
      ),
    db
      .select({
        teamId: ledgerEntries.teamId,
        totalOre: sql<number>`coalesce(sum(${ledgerEntries.amountOre}), 0)::int`,
        draws: sql<number>`count(distinct ${ledgerEntries.matchId}) filter (where ${ledgerEntries.description} like 'Uafgjort%')::int`,
        losses: sql<number>`count(distinct ${ledgerEntries.matchId}) filter (where ${ledgerEntries.description} like 'Nederlag%')::int`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.seasonId, seasonId), eq(ledgerEntries.type, "match")))
      .groupBy(ledgerEntries.teamId),
    db
      .select({ teamId: assignments.teamId, memberId: members.id, name: members.name })
      .from(assignments)
      .innerJoin(members, eq(members.id, assignments.memberId))
      .where(eq(assignments.seasonId, seasonId))
      .orderBy(asc(members.name)),
  ]);

  const ledgerByTeam = new Map(ledgerRows.map((r) => [r.teamId, r]));

  const ownersByTeam = new Map<number, TeamCost["owners"]>();
  for (const row of ownerRows) {
    const list = ownersByTeam.get(row.teamId) ?? [];
    list.push({ memberId: row.memberId, name: row.name });
    ownersByTeam.set(row.teamId, list);
  }

  return teamRows
    .map((team) => {
      const ledger = ledgerByTeam.get(team.teamId);
      return {
        ...team,
        owners: ownersByTeam.get(team.teamId) ?? [],
        totalOre: ledger?.totalOre ?? 0,
        draws: ledger?.draws ?? 0,
        losses: ledger?.losses ?? 0,
      };
    })
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

export async function getTeamById(teamId: number): Promise<TeamRef | null> {
  const [row] = await db
    .select({
      id: teams.id,
      name: teams.name,
      shortName: teams.shortName,
      tla: teams.tla,
      crestUrl: teams.crestUrl,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return row ?? null;
}

/** Dem der har trukket holdet i sæsonen. Flere kan dele det samme hold. */
export async function getTeamOwners(
  seasonId: number,
  teamId: number,
): Promise<{ memberId: number; name: string }[]> {
  return db
    .select({ memberId: members.id, name: members.name })
    .from(assignments)
    .innerJoin(members, eq(members.id, assignments.memberId))
    .where(and(eq(assignments.seasonId, seasonId), eq(assignments.teamId, teamId)))
    .orderBy(asc(members.name));
}

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

type MatchSqlRow = {
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
};

const MATCH_COLUMNS = sql`
  m.id, m.matchday, m.kickoff, m.status, m.home_goals, m.away_goals,
  h.id as home_id, h.name as home_name, h.short_name as home_short, h.tla as home_tla, h.crest_url as home_crest,
  a.id as away_id, a.name as away_name, a.short_name as away_short, a.tla as away_tla, a.crest_url as away_crest
`;

/** Hænger opkrævningerne på kampene, så man kan se hvem hver kamp kostede. */
async function withCharges(rows: MatchSqlRow[]): Promise<MatchRow[]> {
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
            and(eq(ledgerEntries.type, "match"), inArray(ledgerEntries.matchId, matchIds)),
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

export async function getMatchesForMatchday(
  seasonId: number,
  matchday: number,
): Promise<MatchRow[]> {
  const rows = await db.execute<MatchSqlRow>(sql`
    select ${MATCH_COLUMNS}
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where m.season_id = ${seasonId} and m.matchday = ${matchday}
    order by m.kickoff asc, h.short_name asc
  `);
  return withCharges(rows);
}

/** De senest spillede kampe på tværs af runder — det forsiden viser. */
export async function getLatestPlayedMatches(
  seasonId: number,
  limit = 5,
): Promise<MatchRow[]> {
  const rows = await db.execute<MatchSqlRow>(sql`
    select ${MATCH_COLUMNS}
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where m.season_id = ${seasonId}
      and m.status in ('FINISHED', 'AWARDED')
      and m.home_goals is not null
    order by m.kickoff desc, h.short_name asc
    limit ${limit}
  `);
  return withCharges(rows);
}

/** Holdets kampe i sæsonen, nyeste først — med hvad hver af dem kostede. */
export async function getTeamMatches(seasonId: number, teamId: number): Promise<MatchRow[]> {
  const rows = await db.execute<MatchSqlRow>(sql`
    select ${MATCH_COLUMNS}
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where m.season_id = ${seasonId}
      and (m.home_team_id = ${teamId} or m.away_team_id = ${teamId})
    order by m.kickoff desc
  `);
  return withCharges(rows);
}

export type MemberMatchRow = {
  matchId: number;
  teamId: number;
  matchday: number | null;
  kickoff: Date;
  outcome: "win" | "draw" | "loss";
  billingMonth: string;
  amountOre: number;
  scoreline: string;
  teamShortName: string;
};

/**
 * Alle spillede kampe for et medlems hold — også sejrene, der ikke koster noget.
 * Ejer et medlem begge hold i samme kamp, giver kampen to rækker, én pr. hold.
 */
export async function getMemberMatches(
  seasonId: number,
  memberId: number,
): Promise<MemberMatchRow[]> {
  const rows = await db.execute<{
    match_id: number;
    matchday: number | null;
    kickoff: Date;
    home_goals: number;
    away_goals: number;
    team_id: number;
    team_short: string;
    home_short: string;
    away_short: string;
    is_home: boolean;
    amount_ore: number;
    billing_month: string;
  }>(sql`
    select
      m.id as match_id, m.matchday, m.kickoff, m.home_goals, m.away_goals,
      t.id as team_id, t.short_name as team_short,
      h.short_name as home_short, a.short_name as away_short,
      (m.home_team_id = t.id) as is_home,
      coalesce(le.amount_ore, 0) as amount_ore,
      coalesce(
        m.billing_month_override, m.billing_month_default,
        to_char(m.kickoff at time zone 'Europe/Copenhagen', 'YYYY-MM')
      ) as billing_month
    from assignments asg
    join teams t on t.id = asg.team_id
    join matches m
      on m.season_id = asg.season_id
     and (m.home_team_id = t.id or m.away_team_id = t.id)
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    left join ledger_entries le
      on le.match_id = m.id
     and le.team_id = t.id
     and le.member_id = asg.member_id
     and le.type = 'match'
    where asg.season_id = ${seasonId}
      and asg.member_id = ${memberId}
      and m.status in ('FINISHED', 'AWARDED')
      and m.home_goals is not null
      and m.away_goals is not null
    order by m.kickoff desc, t.short_name asc
  `);

  return rows.map((r) => {
    const own = r.is_home ? r.home_goals : r.away_goals;
    const other = r.is_home ? r.away_goals : r.home_goals;
    return {
      matchId: r.match_id,
      teamId: r.team_id,
      matchday: r.matchday,
      kickoff: new Date(r.kickoff),
      billingMonth: r.billing_month,
      outcome: own > other ? ("win" as const) : own === other ? ("draw" as const) : ("loss" as const),
      amountOre: r.amount_ore,
      scoreline: `${r.home_short} ${r.home_goals}-${r.away_goals} ${r.away_short}`,
      teamShortName: r.team_short,
    };
  });
}

export type MemberPeriodStatus = {
  memberId: number;
  name: string;
  /** Opkrævet i måneden — kampe, bøder og reguleringer. */
  chargedOre: number;
  /** Hvor meget af månedens opkrævning der er dækket af indbetalinger. */
  coveredOre: number;
  outstandingOre: number;
  status: "betalt" | "delvist" | "mangler" | "intet";
};

/** Første og sidste kamp der opkræves i en måned, og kampene selv. */
export type MonthSpan = {
  from: Date;
  to: Date;
  matchCount: number;
  /** Kampene med deres opkrævninger, så man kan se hvem der skylder for hvad. */
  matches: MatchRow[];
  /** Kampe spillet i en anden kalendermåned end den de opkræves i. */
  movedIds: number[];
};

export type PeriodOverview = {
  monthKey: string;
  months: string[];
  rows: MemberPeriodStatus[];
  chargedOre: number;
  coveredOre: number;
  outstandingOre: number;
  /** Hvilke datoer måneden dækker. Tom hvis der ikke er spillet kampe endnu. */
  span: MonthSpan | null;
};

/**
 * Datoerne hver opkrævningsmåned rent faktisk dækker.
 *
 * En runde opkræves samlet, så en weekend hen over et månedsskifte lander i
 * den måned runden hører til. Uden datoerne kan man ikke se det på forsiden.
 * Kun spillede kampe tælles med — det er dem der er blevet til penge.
 */
export async function getBillingPeriods(seasonId: number): Promise<Map<string, MonthSpan>> {
  const rows = await db.execute<MatchSqlRow & { billing_month: string; kickoff_month: string }>(sql`
    select ${MATCH_COLUMNS},
      coalesce(
        m.billing_month_override, m.billing_month_default,
        to_char(m.kickoff at time zone 'Europe/Copenhagen', 'YYYY-MM')
      ) as billing_month,
      to_char(m.kickoff at time zone 'Europe/Copenhagen', 'YYYY-MM') as kickoff_month
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where m.season_id = ${seasonId}
      and m.status in ('FINISHED', 'AWARDED')
      and m.home_goals is not null
      and m.away_goals is not null
    order by m.kickoff asc, h.short_name asc
  `);

  const matchRows = await withCharges(rows);
  const spans = new Map<string, MonthSpan>();

  rows.forEach((r, i) => {
    const match = matchRows[i];
    const span = spans.get(r.billing_month);
    if (span) {
      // Rækkerne kommer sorteret, så den sidste vi ser er også den seneste.
      span.to = match.kickoff;
      span.matchCount += 1;
      span.matches.push(match);
    } else {
      spans.set(r.billing_month, {
        from: match.kickoff,
        to: match.kickoff,
        matchCount: 1,
        matches: [match],
        movedIds: [],
      });
    }
    if (r.kickoff_month !== r.billing_month) spans.get(r.billing_month)!.movedIds.push(r.id);
  });

  return spans;
}

type Allocation = {
  months: string[];
  members: { id: number; name: string }[];
  /** måned → medlem → hvad der er opkrævet og dækket. */
  perMonth: Map<string, Map<number, { chargedOre: number; coveredOre: number }>>;
};

/**
 * Fordeler hvert medlems indbetalinger ud over månederne, ældste først.
 *
 * Indbetalinger er ikke mærket med hvilken måned de dækker. Betaler nogen for
 * lidt i oktober, æder november-beløbet altså ikke hullet fra oktober — hullet
 * bliver stående, hvor det opstod.
 */
/**
 * Indbetalinger der er mærket med den periode de dækker: måned → medlem → øre.
 *
 * Betaler man for august den 3. september, er datoen september, men pengene
 * hører til august. Er feltet tomt, er indbetalingen ikke mærket, og så
 * fordeles den ældste gæld først som før.
 */
async function getEarmarkedPayments(seasonId: number): Promise<Map<string, Map<number, number>>> {
  const rows = await db
    .select({
      monthKey: ledgerEntries.billingMonth,
      memberId: ledgerEntries.memberId,
      total: sql<number>`coalesce(sum(${ledgerEntries.amountOre}), 0)::int`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.seasonId, seasonId),
        eq(ledgerEntries.type, "payment"),
        isNotNull(ledgerEntries.billingMonth),
      ),
    )
    .groupBy(ledgerEntries.billingMonth, ledgerEntries.memberId);

  const byMonth = new Map<string, Map<number, number>>();
  for (const row of rows) {
    if (row.monthKey === null) continue;
    const month = byMonth.get(row.monthKey) ?? new Map<number, number>();
    month.set(row.memberId, (month.get(row.memberId) ?? 0) + -row.total);
    byMonth.set(row.monthKey, month);
  }
  return byMonth;
}

async function allocatePayments(seasonId: number): Promise<Allocation> {
  const [memberRows, totals, earmarked] = await Promise.all([
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.isActive, true))
      .orderBy(asc(members.name)),
    getMonthlyMemberTotals(seasonId),
    getEarmarkedPayments(seasonId),
  ]);

  const months = [...totals.keys()].sort();
  const perMonth = new Map<string, Map<number, { chargedOre: number; coveredOre: number }>>();
  for (const key of months) perMonth.set(key, new Map());

  for (const member of memberRows) {
    // Puljen er de penge der ikke er mærket med en periode.
    let pool = 0;
    for (const key of months) {
      const paid = totals.get(key)?.get(member.id)?.paidOre ?? 0;
      pool += paid - (earmarked.get(key)?.get(member.id) ?? 0);
    }

    for (const key of months) {
      const chargedOre = Math.max(0, totals.get(key)?.get(member.id)?.chargedOre ?? 0);

      // Er pengene mærket med perioden, dækker de den periode først.
      const mark = earmarked.get(key)?.get(member.id) ?? 0;
      const fromMark = Math.min(mark, chargedOre);
      // Betalte man for meget til perioden, går resten videre til de næste.
      pool += mark - fromMark;

      const fromPool = Math.min(pool, chargedOre - fromMark);
      pool -= fromPool;

      perMonth.get(key)!.set(member.id, { chargedOre, coveredOre: fromMark + fromPool });
    }
  }

  return { months, members: memberRows, perMonth };
}

/** Opgørelse for én måned: hvem har betalt, og hvem mangler. */
export async function getPeriodOverview(
  seasonId: number,
  wantedMonth?: string,
): Promise<PeriodOverview | null> {
  const [{ months, members: memberRows, perMonth }, spans] = await Promise.all([
    allocatePayments(seasonId),
    getBillingPeriods(seasonId),
  ]);
  if (months.length === 0) return null;

  const monthKey =
    wantedMonth && months.includes(wantedMonth) ? wantedMonth : lastClosedMonth(months);
  const month = perMonth.get(monthKey)!;

  const rows: MemberPeriodStatus[] = memberRows.map((member) => {
    const { chargedOre, coveredOre } = month.get(member.id) ?? { chargedOre: 0, coveredOre: 0 };
    const outstandingOre = chargedOre - coveredOre;
    return {
      memberId: member.id,
      name: member.name,
      chargedOre,
      coveredOre,
      outstandingOre,
      status:
        chargedOre === 0
          ? ("intet" as const)
          : outstandingOre <= 0
            ? ("betalt" as const)
            : coveredOre > 0
              ? ("delvist" as const)
              : ("mangler" as const),
    };
  });

  return {
    monthKey,
    months,
    rows,
    chargedOre: rows.reduce((sum, r) => sum + r.chargedOre, 0),
    coveredOre: rows.reduce((sum, r) => sum + r.coveredOre, 0),
    outstandingOre: rows.reduce((sum, r) => sum + r.outstandingOre, 0),
    span: spans.get(monthKey) ?? null,
  };
}

export type LockSuggestion = { monthKey: string; chargedOre: number; memberCount: number };

/**
 * Måneder hvor alle har betalt, men som ikke er låst endnu.
 *
 * Så længe en måned står åben, kan en ændring af satser, hold eller et rettet
 * resultat regne den om — også efter folk har betalt. Er måneden gjort op, er
 * det gratis at lukke den, og så kan den ikke skride bagud.
 *
 * Indeværende måned tælles ikke med: den er sjældent færdig, og at lukke den
 * ville spærre for helt almindelige registreringer.
 */
export async function getLockSuggestions(seasonId: number): Promise<LockSuggestion[]> {
  const [{ months, perMonth }, locked] = await Promise.all([
    allocatePayments(seasonId),
    getLockedMonths(seasonId),
  ]);

  const now = currentMonthKey();
  const out: LockSuggestion[] = [];

  for (const monthKey of months) {
    if (monthKey >= now || locked.has(monthKey)) continue;

    let chargedOre = 0;
    let outstandingOre = 0;
    let memberCount = 0;
    for (const { chargedOre: charged, coveredOre } of perMonth.get(monthKey)!.values()) {
      if (charged === 0) continue;
      memberCount += 1;
      chargedOre += charged;
      outstandingOre += charged - coveredOre;
    }

    if (chargedOre > 0 && outstandingOre === 0) out.push({ monthKey, chargedOre, memberCount });
  }

  return out;
}

/** Den nyeste måned der ikke er indeværende — det er den, man er ved at kræve ind. */
function lastClosedMonth(months: string[]): string {
  const now = currentMonthKey();
  const closed = months.filter((m) => m < now);
  return closed.length > 0 ? closed[closed.length - 1] : months[months.length - 1];
}

export type MatchBillingRow = {
  id: number;
  matchday: number | null;
  kickoff: Date;
  /** Måneden kampen faktisk spilles i. */
  kickoffMonth: string;
  /** Måneden kampen opkræves i — runden som standard, ellers admins valg. */
  billingMonth: string;
  overridden: boolean;
  home: string;
  away: string;
};

/** Alle kampe med den måned de opkræves i — grundlaget for admins runde-side. */
export async function getMatchBilling(seasonId: number): Promise<MatchBillingRow[]> {
  const rows = await db.execute<{
    id: number;
    matchday: number | null;
    kickoff: Date;
    kickoff_month: string;
    billing_month: string;
    override: string | null;
    home: string;
    away: string;
  }>(sql`
    select
      m.id, m.matchday, m.kickoff,
      to_char(m.kickoff at time zone 'Europe/Copenhagen', 'YYYY-MM') as kickoff_month,
      coalesce(
        m.billing_month_override, m.billing_month_default,
        to_char(m.kickoff at time zone 'Europe/Copenhagen', 'YYYY-MM')
      ) as billing_month,
      m.billing_month_override as override,
      h.short_name as home, a.short_name as away
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where m.season_id = ${seasonId}
    order by m.matchday asc, m.kickoff asc
  `);

  return rows.map((r) => ({
    id: r.id,
    matchday: r.matchday,
    kickoff: new Date(r.kickoff),
    kickoffMonth: r.kickoff_month,
    billingMonth: r.billing_month,
    overridden: r.override !== null,
    home: r.home,
    away: r.away,
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

export type MemberMonthTotal = { chargedOre: number; paidOre: number };

/**
 * Opkrævet og indbetalt pr. medlem pr. måned — grundlaget for den besked
 * admin sender ud, når måneden skal gøres op.
 */
export async function getMonthlyMemberTotals(
  seasonId: number,
): Promise<Map<string, Map<number, MemberMonthTotal>>> {
  const rows = await db
    .select({
      monthKey: monthKeySql,
      memberId: ledgerEntries.memberId,
      type: ledgerEntries.type,
      total: sql<number>`coalesce(sum(${ledgerEntries.amountOre}), 0)::int`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.seasonId, seasonId))
    .groupBy(monthKeySql, ledgerEntries.memberId, ledgerEntries.type);

  const byMonth = new Map<string, Map<number, MemberMonthTotal>>();
  for (const row of rows) {
    const month = byMonth.get(row.monthKey) ?? new Map<number, MemberMonthTotal>();
    const entry = month.get(row.memberId) ?? { chargedOre: 0, paidOre: 0 };
    if (row.type === "payment") entry.paidOre += -row.total;
    else entry.chargedOre += row.total;
    month.set(row.memberId, entry);
    byMonth.set(row.monthKey, month);
  }
  return byMonth;
}
