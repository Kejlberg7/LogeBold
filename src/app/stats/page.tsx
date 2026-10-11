import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { StatsDashboard } from "@/components/stats-dashboard";
import { getStatsHistory } from "@/lib/queries";
import { getActiveSeason } from "@/lib/sync";

export const metadata: Metadata = { title: "Logens stats · LogeBold" };

export default async function StatsPage() {
  const season = await getActiveSeason();
  if (!season) return <PageTitle title="Logens stats" lead="Sæsonen er ikke sat op endnu." />;

  const history = await getStatsHistory(season.id);
  return <StatsDashboard season={season.name} history={history} />;
}
