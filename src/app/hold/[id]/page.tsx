import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveSeason } from "@/lib/sync";
import { getTeamById, getTeamMatches, getTeamOwners } from "@/lib/queries";
import { formatOre } from "@/lib/money";
import { Card, CardHeader, Empty, PageTitle, Stat } from "@/components/ui";
import { MatchList } from "@/components/match-list";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  const team = await getTeamById(teamId);
  if (!team) notFound();

  const season = await getActiveSeason();
  if (!season) {
    return <PageTitle title={team.name} lead="Sæsonen er ikke sat op endnu." />;
  }

  const [matches, owners] = await Promise.all([
    getTeamMatches(season.id, teamId),
    getTeamOwners(season.id, teamId),
  ]);

  const played = matches.filter((m) => m.homeGoals !== null && m.awayGoals !== null);
  // Kampene kommer nyeste først. De kommende vendes om, så den næste står øverst.
  const upcoming = matches
    .filter((m) => m.homeGoals === null || m.awayGoals === null)
    .reverse();

  // Set fra holdets egen side: hjemme eller ude, det er de samme tre udfald.
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const match of played) {
    const own = match.homeTeam.id === teamId ? match.homeGoals! : match.awayGoals!;
    const other = match.homeTeam.id === teamId ? match.awayGoals! : match.homeGoals!;
    if (own > other) wins += 1;
    else if (own === other) draws += 1;
    else losses += 1;
  }

  // Kun det holdet selv har kostet — deler to medlemmer holdet, tæller begge med.
  const costOre = matches.reduce(
    (sum, match) =>
      sum +
      match.charges
        .filter((c) => c.teamId === teamId)
        .reduce((s, c) => s + c.amountOre, 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/tabel" className="text-[14px] text-ink-soft underline">
          ← Stilling
        </Link>
        <PageTitle
          title={team.shortName}
          lead={
            owners.length > 0 ? (
              <>
                Trukket af{" "}
                {owners.map((owner, i) => (
                  <span key={owner.memberId}>
                    {i > 0 ? (i === owners.length - 1 ? " og " : ", ") : ""}
                    <Link
                      href={`/medlem/${owner.memberId}`}
                      className="underline decoration-rule underline-offset-4"
                    >
                      {owner.name}
                    </Link>
                  </span>
                ))}
              </>
            ) : (
              "Ingen i logen har trukket dette hold."
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Stat
          label="Kostet i sæsonen"
          ore={costOre}
          tone="debt"
          hint={`${played.length} spillede kampe`}
        />
      </div>

      <Card>
        <CardHeader title="Sæsonen indtil nu" />
        <dl className="grid grid-cols-2 gap-px overflow-hidden bg-rule-soft sm:grid-cols-4">
          {[
            { label: "Sejre", value: String(wins) },
            { label: "Uafgjorte", value: String(draws) },
            { label: "Nederlag", value: String(losses) },
            { label: "Kostet", value: formatOre(costOre) },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
              <dt className="label">{item.label}</dt>
              <dd className="num text-[17px]">{item.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Spillede kampe" />
        {played.length === 0 ? (
          <Empty>Holdet har ikke spillet endnu.</Empty>
        ) : (
          <MatchList matches={played} />
        )}
      </Card>

      {upcoming.length > 0 ? (
        <Card>
          <details>
            <summary className="cursor-pointer px-4 py-3 text-[14px] text-ink-soft hover:text-ink">
              {upcoming.length} kampe tilbage i sæsonen
            </summary>
            <div className="border-t border-rule-soft">
              <MatchList matches={upcoming} />
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}
