import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import { getLockedMonths, getMatchBilling, type MatchBillingRow } from "@/lib/queries";
import { formatDateTime, monthLabel } from "@/lib/dates";
import { Badge, Card, CardHeader, Empty, PageTitle } from "@/components/ui";
import { BillingMonthForm } from "@/components/admin-forms";

type Round = {
  matchday: number | null;
  matches: MatchBillingRow[];
  /** De måneder rundens kampe rent faktisk spilles i. */
  kickoffMonths: string[];
  billingMonths: string[];
};

function groupRounds(rows: MatchBillingRow[]): Round[] {
  const byRound = new Map<number | null, MatchBillingRow[]>();
  for (const row of rows) {
    const list = byRound.get(row.matchday) ?? [];
    list.push(row);
    byRound.set(row.matchday, list);
  }
  return [...byRound.entries()].map(([matchday, matches]) => ({
    matchday,
    matches,
    kickoffMonths: [...new Set(matches.map((m) => m.kickoffMonth))].sort(),
    billingMonths: [...new Set(matches.map((m) => m.billingMonth))].sort(),
  }));
}

export default async function RoundsPage({
  searchParams,
}: {
  searchParams: Promise<{ alle?: string }>;
}) {
  await requireAdmin();
  const { alle } = await searchParams;
  const showAll = alle === "1";

  const season = await getActiveSeason();
  if (!season) {
    return <PageTitle title="Runder og måneder" lead="Ingen aktiv sæson." />;
  }

  const [rows, locked] = await Promise.all([
    getMatchBilling(season.id),
    getLockedMonths(season.id),
  ]);
  const rounds = groupRounds(rows).reverse();

  // Kun runder der er værd at kigge på: dem der krydser et månedsskifte, og dem
  // nogen allerede har flyttet. Resten følger reglen og behøver ingen hånd.
  const interesting = rounds.filter(
    (r) => r.kickoffMonths.length > 1 || r.matches.some((m) => m.overridden),
  );
  const shown = showAll ? rounds : interesting;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-[14px] text-ink-soft underline">
          ← Admin
        </Link>
        <PageTitle
          title="Runder og måneder"
          lead="Sådan fordeler kampene sig på måneder — og her kan de flyttes."
        />
      </div>

      <Card className="flex flex-col gap-2 p-4 text-[14px] text-ink-soft">
        <p>
          En runde opkræves samlet i den måned, dens weekend begynder i — så en runde hen
          over et månedsskifte ikke bliver delt i to opkrævninger.
        </p>
        <p>
          Udsatte kampe er undtaget. Ligger en kamp mere end en uge fra resten af runden,
          opkræves den i den måned den rent faktisk spilles i, så den ikke havner i et
          regnskab der for længst er gjort op.
        </p>
        <p>Du behøver kun kigge på de runder der står nedenfor.</p>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-[14px] text-ink-soft">
          {showAll
            ? `Alle ${rounds.length} runder`
            : `${interesting.length} runde${interesting.length === 1 ? "" : "r"} er værd at kigge på`}
        </span>
        <Link
          href={showAll ? "/admin/runder" : "/admin/runder?alle=1"}
          className="text-[14px] text-ink-soft underline"
        >
          {showAll ? "Vis kun dem der kræver et kig" : "Vis alle runder"}
        </Link>
      </div>

      {shown.length === 0 ? (
        <Card>
          <Empty>Ingen runder krydser et månedsskifte. Der er ikke noget at rette.</Empty>
        </Card>
      ) : (
        shown.map((round) => {
          const options = round.kickoffMonths.map((m) => ({
            value: m,
            label: monthLabel(m),
          }));
          const split = round.billingMonths.length > 1;

          return (
            <Card key={String(round.matchday)}>
              <CardHeader
                title={round.matchday === null ? "Uden runde" : `Runde ${round.matchday}`}
                action={
                  <span className="flex items-center gap-2 text-[13px] text-ink-soft">
                    {round.billingMonths.map((m) => (
                      <span key={m} className="flex items-center gap-1">
                        {monthLabel(m)}
                        {locked.has(m) ? <Badge>Lukket</Badge> : null}
                      </span>
                    ))}
                  </span>
                }
              />

              {split ? (
                <p className="border-b border-rule-soft px-4 py-2 text-[13px] text-ink-soft">
                  Rundens kampe opkræves i {round.billingMonths.length} forskellige måneder.
                  Det er som det skal være, hvis en kamp er udsat.
                </p>
              ) : null}

              <div className="border-b border-rule-soft px-4 py-3">
                <BillingMonthForm
                  scope="round"
                  matchday={round.matchday}
                  current={round.billingMonths[0]}
                  options={options}
                  overridden={round.matches.some((m) => m.overridden)}
                  label="Flyt hele runden"
                />
              </div>

              <ul>
                {round.matches.map((match) => (
                  <li
                    key={match.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-soft px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[15px]">
                        {match.home} – {match.away}
                      </div>
                      <div className="text-[13px] text-ink-soft">
                        {formatDateTime(match.kickoff)} · opkræves i {monthLabel(match.billingMonth)}
                        {match.overridden ? " · flyttet" : ""}
                      </div>
                    </div>
                    <BillingMonthForm
                      scope="match"
                      matchId={match.id}
                      current={match.billingMonth}
                      options={options}
                      overridden={match.overridden}
                      label="Flyt"
                    />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
