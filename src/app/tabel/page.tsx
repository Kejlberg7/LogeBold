import Link from "next/link";
import { getActiveSeason } from "@/lib/sync";
import { getStandings, getTeamCosts } from "@/lib/queries";
import { formatOreBare } from "@/lib/money";
import { Card, CardHeader, Empty, Money, PageTitle } from "@/components/ui";

export default async function StandingsPage() {
  const season = await getActiveSeason();
  if (!season) {
    return <PageTitle title="Stilling" lead="Sæsonen er ikke sat op endnu." />;
  }

  const [standings, teamCosts] = await Promise.all([
    getStandings(season.id),
    getTeamCosts(season.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Stilling" lead="Hvem har det dyreste hold — og hvem skylder mest." />

      <Card>
        <CardHeader title="Medlemmer" />
        {standings.length === 0 ? (
          <Empty>Ingen medlemmer endnu.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-rule">
                  <th className="label px-4 py-2 text-left font-normal">Medlem</th>
                  <th className="label px-2 py-2 text-right font-normal">I alt</th>
                  <th className="label hidden px-2 py-2 text-right font-normal sm:table-cell">
                    Bøder
                  </th>
                  <th className="label hidden px-2 py-2 text-right font-normal sm:table-cell">
                    Betalt
                  </th>
                  <th className="label px-4 py-2 text-right font-normal">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr
                    key={s.memberId}
                    className="border-b border-rule-soft transition last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-2.5">
                      {/* Navn og hold er hvert sit link — et link i et link er ikke gyldigt. */}
                      <Link
                        href={`/medlem/${s.memberId}`}
                        className="block text-[15px] underline decoration-rule underline-offset-4"
                      >
                        {s.name}
                      </Link>
                      <div className="text-[12.5px] text-ink-soft">
                        {s.teams.map((t, i) => (
                          <span key={t.id}>
                            {i > 0 ? " · " : ""}
                            <Link
                              href={`/hold/${t.id}`}
                              className="underline decoration-rule underline-offset-4 hover:text-ink"
                            >
                              {t.shortName}
                            </Link>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num whitespace-nowrap px-2 py-2.5 text-right">
                      {/* Alt hvad der er opkrævet: kampe, bøder og reguleringer. */}
                      {formatOreBare(s.matchOre + s.fineOre + s.adjustmentOre)}
                    </td>
                    <td className="num hidden px-2 py-2.5 text-right text-ink-soft sm:table-cell">
                      {s.fineOre === 0 ? "–" : formatOreBare(s.fineOre)}
                    </td>
                    <td className="num hidden px-2 py-2.5 text-right text-ink-soft sm:table-cell">
                      {s.paidOre === 0 ? "–" : formatOreBare(s.paidOre)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Money ore={s.balanceOre} className="text-[14px]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Hold" />
        {teamCosts.length === 0 ? (
          <Empty>Holdene er ikke fordelt endnu.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-rule">
                  <th className="label px-4 py-2 text-left font-normal">Hold</th>
                  <th className="label px-2 py-2 text-right font-normal">U</th>
                  <th className="label px-2 py-2 text-right font-normal">Tab</th>
                  <th className="label px-4 py-2 text-right font-normal">Kostet</th>
                </tr>
              </thead>
              <tbody>
                {teamCosts.map((t) => (
                  <tr
                    key={t.teamId}
                    className="border-b border-rule-soft transition last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/hold/${t.teamId}`}
                        className="block text-[15px] underline decoration-rule underline-offset-4"
                      >
                        {t.shortName}
                      </Link>
                      <div className="text-[12.5px] text-ink-soft">
                        {t.owners.length === 0
                          ? "Ingen ejer"
                          : t.owners.map((owner, i) => (
                              <span key={owner.memberId}>
                                {i > 0 ? " · " : ""}
                                <Link
                                  href={`/medlem/${owner.memberId}`}
                                  className="underline decoration-rule underline-offset-4 hover:text-ink"
                                >
                                  {owner.name}
                                </Link>
                              </span>
                            ))}
                      </div>
                    </td>
                    <td className="num px-2 py-2.5 text-right text-ink-soft">{t.draws}</td>
                    <td className="num px-2 py-2.5 text-right text-ink-soft">{t.losses}</td>
                    <td className="num px-4 py-2.5 text-right">{formatOreBare(t.totalOre)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
