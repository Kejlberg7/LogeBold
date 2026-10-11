export type StatsEntry = {
  day: string;
  memberId: number;
  teamId: number | null;
  type: "match" | "fine" | "adjustment" | "payment";
  amountOre: number;
};

export type StatsMember = { id: number; name: string; teams: string[] };
export type StatsTeam = { id: number; name: string; owners: string[] };
export type StatsMemberTotal = { chargedOre: number; paidOre: number };
export type StatsPoint = {
  day: string;
  chargedOre: number;
  paidOre: number;
  paidOutOre: number;
  matchOre: number;
  fineOre: number;
  adjustmentOre: number;
  members: Record<number, StatsMemberTotal>;
  teams: Record<number, number>;
};

export type StatsHistory = {
  points: StatsPoint[];
  members: StatsMember[];
  teams: StatsTeam[];
};

// Keys have already been resolved in Europe/Copenhagen by SQL. UTC here only
// increments calendar labels; it never assigns an event to a day or month.
function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Net ledger history, including reversals and former members/owners. */
export function buildStatsTimeline(
  entries: StatsEntry[],
  payouts: { day: string; amountOre: number }[],
): StatsPoint[] {
  const days = [...entries.map((entry) => entry.day), ...payouts.map((payout) => payout.day)].sort();
  if (days.length === 0) return [];

  const entriesByDay = new Map<string, StatsEntry[]>();
  const payoutsByDay = new Map<string, number>();
  for (const entry of entries) {
    const group = entriesByDay.get(entry.day) ?? [];
    group.push(entry);
    entriesByDay.set(entry.day, group);
  }
  for (const payout of payouts) {
    payoutsByDay.set(payout.day, (payoutsByDay.get(payout.day) ?? 0) + payout.amountOre);
  }

  const points: StatsPoint[] = [];
  let previous: StatsPoint = {
    day: "", chargedOre: 0, paidOre: 0, paidOutOre: 0,
    matchOre: 0, fineOre: 0, adjustmentOre: 0, members: {}, teams: {},
  };
  // Include an explicit zero baseline, and carry balances across quiet days.
  for (let day = shiftDay(days[0], -1); day <= days[days.length - 1]; day = shiftDay(day, 1)) {
    const point: StatsPoint = {
      ...previous, day, members: { ...previous.members }, teams: { ...previous.teams },
      paidOutOre: previous.paidOutOre + (payoutsByDay.get(day) ?? 0),
    };
    for (const entry of entriesByDay.get(day) ?? []) {
      const member = { ...(point.members[entry.memberId] ?? { chargedOre: 0, paidOre: 0 }) };
      if (entry.type === "payment") {
        point.paidOre -= entry.amountOre;
        member.paidOre -= entry.amountOre;
      } else {
        point.chargedOre += entry.amountOre;
        member.chargedOre += entry.amountOre;
        if (entry.type === "match") {
          point.matchOre += entry.amountOre;
          if (entry.teamId !== null) {
            point.teams[entry.teamId] = (point.teams[entry.teamId] ?? 0) + entry.amountOre;
          }
        } else if (entry.type === "fine") point.fineOre += entry.amountOre;
        else point.adjustmentOre += entry.amountOre;
      }
      point.members[entry.memberId] = member;
    }
    points.push(point);
    previous = point;
  }
  return points;
}
