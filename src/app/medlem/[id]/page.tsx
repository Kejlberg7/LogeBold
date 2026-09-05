import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveSeason } from "@/lib/sync";
import {
  getBillingPeriods,
  getLockedMonths,
  getMemberById,
  getMemberEntries,
  getMemberMatches,
  getStandings,
  type LedgerRow,
} from "@/lib/queries";
import { formatDate, formatDateRange, monthKey, monthLabel } from "@/lib/dates";
import { formatOre } from "@/lib/money";
import { Badge, Card, CardHeader, Empty, Money, PageTitle, Stat } from "@/components/ui";

const TYPE_LABELS: Record<LedgerRow["type"], string> = {
  match: "Kamp",
  fine: "Bøde",
  payment: "Indbetaling",
  adjustment: "Regulering",
};

const OUTCOME_LABELS = {
  win: "Sejr",
  draw: "Uafgjort",
  loss: "Nederlag",
} as const;

/** En linje i historikken — enten en kamp eller en postering. */
type Item = {
  key: string;
  occurredAt: Date;
  /** Måneden posteringen opkræves i — ikke nødvendigvis den måned datoen ligger i. */
  month: string;
  title: string;
  meta: ReactNode;
  amountOre: number;
  /** Ligger datoen uden for den måned den opkræves i? */
  moved: boolean;
};

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memberId = Number(id);
  if (!Number.isInteger(memberId)) notFound();

  const member = await getMemberById(memberId);
  if (!member) notFound();

  const season = await getActiveSeason();
  if (!season) {
    return <PageTitle title={member.name} lead="Sæsonen er ikke sat op endnu." />;
  }

  const [entries, matchRows, standings, locked, periods] = await Promise.all([
    getMemberEntries(season.id, memberId),
    getMemberMatches(season.id, memberId),
    getStandings(season.id),
    getLockedMonths(season.id),
    getBillingPeriods(season.id),
  ]);

  const stats = standings.find((s) => s.memberId === memberId);

  // Kampene kommer fra kampoversigten, så også sejre uden opkrævning kommer med.
  const items: Item[] = matchRows.map((m) => ({
    key: `m${m.matchId}:${m.teamId}`,
    occurredAt: m.kickoff,
    month: m.billingMonth,
    title: `${OUTCOME_LABELS[m.outcome]}: ${m.scoreline}`,
    meta: (
      <>
        {formatDate(m.kickoff)} ·{" "}
        <Link
          href={`/hold/${m.teamId}`}
          className="underline decoration-rule underline-offset-4 hover:text-ink"
        >
          {m.teamShortName}
        </Link>
        {m.matchday ? ` · runde ${m.matchday}` : ""}
      </>
    ),
    amountOre: m.amountOre,
    moved: m.billingMonth !== monthKey(m.kickoff),
  }));

  // Posteringer der ikke er kampe — bøder, indbetalinger, reguleringer. Skulle en
  // kampopkrævning stå tilbage uden en kamp i oversigten (holdet er skiftet ejer),
  // tages den med, så månedens sum stadig stemmer med saldoen.
  const seenMatches = new Set(matchRows.map((m) => `${m.matchId}:${m.teamId}`));
  for (const entry of entries) {
    if (entry.type === "match" && entry.matchId !== null && entry.teamId !== null) {
      if (seenMatches.has(`${entry.matchId}:${entry.teamId}`)) continue;
    }
    items.push({
      key: `e${entry.id}`,
      occurredAt: entry.occurredAt,
      month: entry.billingMonth ?? monthKey(entry.occurredAt),
      title: entry.description,
      meta: `${formatDate(entry.occurredAt)} · ${TYPE_LABELS[entry.type]}${
        entry.paymentMethod ? ` · ${entry.paymentMethod}` : ""
      }${entry.matchday ? ` · runde ${entry.matchday}` : ""}`,
      amountOre: entry.amountOre,
      moved:
        entry.billingMonth !== null && entry.billingMonth !== monthKey(entry.occurredAt),
    });
  }

  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const byMonth = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.month;
    const list = byMonth.get(key) ?? [];
    list.push(item);
    byMonth.set(key, list);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  const wins = matchRows.filter((m) => m.outcome === "win").length;
  const draws = matchRows.filter((m) => m.outcome === "draw").length;
  const losses = matchRows.filter((m) => m.outcome === "loss").length;
  const chargedOre =
    (stats?.matchOre ?? 0) + (stats?.fineOre ?? 0) + (stats?.adjustmentOre ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/tabel" className="text-[14px] text-ink-soft underline">
          ← Stilling
        </Link>
        <PageTitle
          title={member.name}
          lead={
            stats && stats.teams.length > 0 ? (
              stats.teams.map((t, i) => (
                <span key={t.id}>
                  {i > 0 ? " og " : ""}
                  <Link
                    href={`/hold/${t.id}`}
                    className="underline decoration-rule underline-offset-4"
                  >
                    {t.shortName}
                  </Link>
                </span>
              ))
            ) : (
              "Har ikke fået hold endnu."
            )
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Saldo"
          ore={stats?.balanceOre ?? 0}
          tone={(stats?.balanceOre ?? 0) > 0 ? "debt" : "credit"}
          hint={(stats?.balanceOre ?? 0) > 0 ? "Mangler at betale" : "Intet udestående"}
        />
        <Stat
          label="Betalt i alt"
          ore={stats?.paidOre ?? 0}
          tone="credit"
          hint={`Opkrævet ${formatOre(chargedOre)}`}
        />
      </div>

      <Card>
        <CardHeader title="Sæsonen indtil nu" />
        <dl className="grid grid-cols-3 gap-px overflow-hidden bg-rule-soft sm:grid-cols-5">
          {[
            { label: "Sejre", value: String(wins) },
            { label: "Uafgjorte", value: String(draws) },
            { label: "Nederlag", value: String(losses) },
            { label: "I alt", value: formatOre(chargedOre) },
            { label: "Bøder", value: formatOre(stats?.fineOre ?? 0) },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
              <dt className="label">{item.label}</dt>
              <dd className="num text-[17px]">{item.value}</dd>
            </div>
          ))}
          {/* Fylder det tomme felt i mobilens 3-kolonnegitter, så kortet ikke får et hul. */}
          <div className="bg-surface sm:hidden" />
        </dl>
      </Card>

      {months.length === 0 ? (
        <Card>
          <Empty>Ingen kampe eller posteringer endnu.</Empty>
        </Card>
      ) : (
        months.map((key) => {
          const rows = byMonth.get(key)!;
          const total = rows.reduce((sum, r) => sum + r.amountOre, 0);
          const period = periods.get(key);
          // Samme periode som forsiden viser — en runde hen over et månedsskifte
          // opkræves samlet, og så dækker "august" mere end august.
          const spillMonths = period
            ? [...new Set([monthKey(period.from), monthKey(period.to)])].filter((m) => m !== key)
            : [];
          return (
            <Card key={key}>
              <CardHeader
                title={monthLabel(key)}
                action={
                  <span className="flex items-center gap-2">
                    {locked.has(key) ? <Badge>Lukket</Badge> : null}
                    <Money ore={total} className="text-[14px]" />
                  </span>
                }
              />
              {period ? (
                <div className="border-b border-rule-soft px-4 py-2 text-[13px] text-ink-soft">
                  Perioden dækker {formatDateRange(period.from, period.to)}
                  {spillMonths.length > 0 ? (
                    <span className="mt-0.5 block">
                      En runde hen over et månedsskifte opkræves samlet, så kampe i{" "}
                      {spillMonths.map(monthLabel).join(" og ")} tælles med her.
                    </span>
                  ) : null}
                </div>
              ) : null}
              <ul>
                {rows.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-baseline justify-between gap-3 border-b border-rule-soft px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[15px]">{row.title}</div>
                      <div className={`text-[13px] ${row.moved ? "text-debt" : "text-ink-soft"}`}>
                        {row.meta}
                      </div>
                    </div>
                    <Money ore={row.amountOre} showZeroDash className="shrink-0 text-[15px]" />
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
