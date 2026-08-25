import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import {
  getLatestPlayedMatchday,
  getMatchdays,
  getMatchesForMatchday,
} from "@/lib/queries";
import { formatOre } from "@/lib/money";
import { Card, CardHeader, Empty, PageTitle } from "@/components/ui";
import { MatchList } from "@/components/match-list";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ runde?: string }>;
}) {
  await requireSession();
  const season = await getActiveSeason();
  if (!season) {
    return <PageTitle title="Kampe" lead="Sæsonen er ikke sat op endnu." />;
  }

  const params = await searchParams;
  const [matchdays, latest] = await Promise.all([
    getMatchdays(season.id),
    getLatestPlayedMatchday(season.id),
  ]);

  const requested = Number(params.runde);
  const selected =
    matchdays.includes(requested) ? requested : (latest ?? matchdays[0] ?? null);

  const matches = selected ? await getMatchesForMatchday(season.id, selected) : [];
  const roundTotal = matches.reduce(
    (sum, m) => sum + m.charges.reduce((s, c) => s + c.amountOre, 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Kampe" lead="Runde for runde — hvem der betalte, og hvor meget." />

      {matchdays.length === 0 ? (
        <Card>
          <Empty>Ingen kampe hentet endnu.</Empty>
        </Card>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex gap-1.5 pb-1">
              {matchdays.map((md) => (
                <Link
                  key={md}
                  href={`/kampe?runde=${md}`}
                  scroll={false}
                  className={`num shrink-0 rounded-md border px-3 py-1.5 text-[14px] transition ${
                    md === selected
                      ? "border-ink bg-ink text-paper"
                      : "border-rule text-ink-soft hover:text-ink"
                  }`}
                >
                  {md}
                </Link>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader
              title={`Runde ${selected}`}
              action={
                <span className="num text-[14px] text-ink-soft">
                  {roundTotal > 0 ? `${formatOre(roundTotal)} i alt` : "Intet opkrævet"}
                </span>
              }
            />
            {matches.length === 0 ? <Empty>Ingen kampe i runden.</Empty> : <MatchList matches={matches} />}
          </Card>
        </>
      )}
    </div>
  );
}
