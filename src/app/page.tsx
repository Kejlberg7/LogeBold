import Link from "next/link";
import { getActiveSeason } from "@/lib/sync";
import {
  getLatestPlayedMatchday,
  getMatchesForMatchday,
  getMonthlySummary,
  getPotSummary,
  getStandings,
} from "@/lib/queries";
import { currentMonthKey, monthLabel } from "@/lib/dates";
import { formatOre } from "@/lib/money";
import { Badge, Card, CardHeader, Empty, Money, PageTitle, Stat } from "@/components/ui";
import { OutstandingTable } from "@/components/outstanding-table";
import { MatchList } from "@/components/match-list";

export default async function OverviewPage() {
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

  const [pot, standings, monthly, latestMatchday] = await Promise.all([
    getPotSummary(season.id),
    getStandings(season.id),
    getMonthlySummary(season.id),
    getLatestPlayedMatchday(season.id),
  ]);

  const lastRound = latestMatchday ? await getMatchesForMatchday(season.id, latestMatchday) : [];
  const thisMonth = monthly.find((m) => m.monthKey === currentMonthKey());
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

      {thisMonth ? (
        <Card>
          <CardHeader title={`Denne måned · ${monthLabel(thisMonth.monthKey)}`} />
          <div className="flex items-center justify-between px-4 py-3 text-[15px]">
            <span className="text-ink-soft">Opkrævet</span>
            <Money ore={thisMonth.chargedOre} />
          </div>
          <div className="flex items-center justify-between border-t border-rule-soft px-4 py-3 text-[15px]">
            <span className="text-ink-soft">Indbetalt</span>
            {/* Vist som et positivt beløb — "Indbetalt −175 kr" læser forkert. */}
            <Money ore={thisMonth.paidOre} colored={false} className="text-credit" />
          </div>
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
          title={latestMatchday ? `Seneste runde · runde ${latestMatchday}` : "Seneste runde"}
          action={
            <Link href="/kampe" className="text-[14px] text-ink-soft underline">
              Alle runder
            </Link>
          }
        />
        {lastRound.length === 0 ? (
          <Empty>Ingen spillede kampe endnu.</Empty>
        ) : (
          <MatchList matches={lastRound.slice(0, 5)} />
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
