import Link from "next/link";
import { requireSession } from "@/lib/auth";
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
import { MatchList } from "@/components/match-list";

export default async function OverviewPage() {
  const session = await requireSession();
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title="Ingen sæson endnu" lead="Logen er oprettet, men sæsonen mangler." />
        <Card className="p-5 text-[15px] text-ink-soft">
          {session.isAdmin ? (
            <>
              Gå til <Link href="/admin/satser" className="text-debt underline">Satser og sæson</Link> og
              opret sæsonen. Derefter kan du hente kampene og fordele holdene.
            </>
          ) : (
            "Admin er ved at sætte sæsonen op. Kig forbi igen om lidt."
          )}
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
  const me = standings.find((s) => s.memberId === session.id);
  const thisMonth = monthly.find((m) => m.monthKey === currentMonthKey());
  const topSpenders = [...standings].slice(0, 5);

  return (
    <div className="flex flex-col gap-7">
      <PageTitle
        title="Oversigt"
        lead={`${season.name} · uafgjort ${formatOre(season.drawFeeOre)} · nederlag ${formatOre(season.lossFeeOre)}`}
      />

      {me ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div className="flex flex-col gap-1">
              <span className="label">Din saldo</span>
              <Money ore={me.balanceOre} className="text-3xl font-semibold" />
              <span className="text-[13px] text-ink-soft">
                {me.teams.map((t) => t.shortName).join(" og ") || "Ingen hold endnu"}
              </span>
            </div>
            <Link href="/mig" className="text-[15px] text-debt underline">
              Se mine posteringer
            </Link>
          </div>
        </Card>
      ) : null}

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
          title="Dyreste medlemmer"
          action={
            <Link href="/tabel" className="text-[14px] text-ink-soft underline">
              Hele tabellen
            </Link>
          }
        />
        {topSpenders.length === 0 ? (
          <Empty>Ingen medlemmer endnu.</Empty>
        ) : (
          <ul>
            {topSpenders.map((s, i) => (
              <li
                key={s.memberId}
                className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="num w-5 shrink-0 text-[13px] text-ink-faint">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[15px]">{s.name}</div>
                    <div className="truncate text-[13px] text-ink-soft">
                      {s.teams.map((t) => t.shortName).join(" · ")}
                    </div>
                  </div>
                </div>
                <Money ore={s.matchOre + s.fineOre} colored={false} className="text-[15px]" />
              </li>
            ))}
          </ul>
        )}
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
