import Link from "next/link";
import { getActiveSeason } from "@/lib/sync";
import {
  getLatestPlayedMatches,
  getPeriodOverview,
  getPotSummary,
  getStandings,
} from "@/lib/queries";
import { formatDateRange, monthKey, monthLabel } from "@/lib/dates";
import { formatOre } from "@/lib/money";
import { Badge, Card, CardHeader, Empty, PageTitle, Stat } from "@/components/ui";
import { OutstandingTable } from "@/components/outstanding-table";
import { PeriodTable } from "@/components/period-table";
import { MatchList } from "@/components/match-list";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ maaned?: string }>;
}) {
  const { maaned } = await searchParams;
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title="Ingen sæson endnu" lead="Logen er oprettet, men sæsonen mangler." />
        <Card className="p-5 text-[15px] text-ink-soft">
          Sæsonen er ved at blive sat op. Kig forbi igen om lidt.
        </Card>
      </div>
    );
  }

  const [pot, standings, period, latestMatches] = await Promise.all([
    getPotSummary(season.id),
    getStandings(season.id),
    getPeriodOverview(season.id, maaned),
    getLatestPlayedMatches(season.id, 5),
  ]);

  const monthIndex = period ? period.months.indexOf(period.monthKey) : -1;
  const prevMonth = period && monthIndex > 0 ? period.months[monthIndex - 1] : null;
  const nextMonth =
    period && monthIndex >= 0 && monthIndex < period.months.length - 1
      ? period.months[monthIndex + 1]
      : null;
  // Kampe fra en anden kalendermåned end den vi står på — det er dem der ville
  // undre folk, hvis datoerne ikke stod der.
  const spillMonths = period?.span
    ? [...new Set([monthKey(period.span.from), monthKey(period.span.to)])].filter(
        (m) => m !== period.monthKey,
      )
    : [];

  const owing = standings
    .filter((s) => s.balanceOre > 0)
    .sort((a, b) => b.balanceOre - a.balanceOre)
    .map((s) => ({
      memberId: s.memberId,
      name: s.name,
      matchOre: s.matchOre,
      fineOre: s.fineOre,
      adjustmentOre: s.adjustmentOre,
      paidOre: s.paidOre,
      balanceOre: s.balanceOre,
    }));

  const settled = standings
    .filter((s) => s.balanceOre <= 0 && s.paidOre > 0)
    .map((s) => s.name);

  return (
    <div className="flex flex-col gap-7">
      <PageTitle
        title="Oversigt"
        lead={`${season.name} · uafgjort ${formatOre(season.drawFeeOre)} · nederlag ${formatOre(season.lossFeeOre)}`}
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="I kassen"
          ore={pot.potOre}
          tone="credit"
          hint={pot.paidOutOre > 0 ? `Efter udbetalinger på ${formatOre(pot.paidOutOre)}` : "Indbetalt i alt"}
        />
        <Stat
          label="Udestående"
          ore={pot.outstandingOre}
          tone="debt"
          hint={`Opkrævet i alt ${formatOre(pot.chargedOre)}`}
        />
      </div>

      {period ? (
        <Card>
          <CardHeader
            title={`Måneden ${monthLabel(period.monthKey)}`}
            action={
              <span className="flex items-center gap-3 text-[14px]">
                {prevMonth ? (
                  <Link href={`/?maaned=${prevMonth}`} className="text-ink-soft underline">
                    ← {monthLabel(prevMonth)}
                  </Link>
                ) : null}
                {nextMonth ? (
                  <Link href={`/?maaned=${nextMonth}`} className="text-ink-soft underline">
                    {monthLabel(nextMonth)} →
                  </Link>
                ) : null}
              </span>
            }
          />
          {period.span ? (
            <details className="border-b border-rule-soft">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-ink-soft hover:text-ink">
                Dækker {period.span.matchCount} kampe ·{" "}
                {formatDateRange(period.span.from, period.span.to)}
                {spillMonths.length > 0 ? (
                  <span className="mt-0.5 block">
                    En runde hen over et månedsskifte opkræves samlet, så kampe i{" "}
                    {spillMonths.map(monthLabel).join(" og ")} tælles med her.
                  </span>
                ) : null}
              </summary>
              <div className="border-t border-rule-soft bg-surface-2">
                <MatchList
                  matches={period.span.matches}
                  movedIds={new Set(period.span.movedIds)}
                />
              </div>
            </details>
          ) : null}
          <PeriodTable
            rows={period.rows}
            heading={`Logen ${season.name} — ${monthLabel(period.monthKey)}`}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Hvem skylder hvad"
          action={
            <Link href="/tabel" className="text-[14px] text-ink-soft underline">
              Hele stillingen
            </Link>
          }
        />
        <OutstandingTable
          rows={owing}
          settled={settled}
          heading={`Logen ${season.name} — skyldige beløb`}
        />
      </Card>

      <Card>
        <CardHeader
          title="Seneste resultater"
          action={
            <Link href="/kampe" className="text-[14px] text-ink-soft underline">
              Alle runder
            </Link>
          }
        />
        {latestMatches.length === 0 ? (
          <Empty>Ingen spillede kampe endnu.</Empty>
        ) : (
          <MatchList matches={latestMatches} />
        )}
      </Card>

      {pot.memberCount > 0 ? (
        <p className="text-center text-[13px] text-ink-soft">
          {pot.memberCount} medlemmer i logen · <Badge>{season.name}</Badge>
        </p>
      ) : null}
    </div>
  );
}
