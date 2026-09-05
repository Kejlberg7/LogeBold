import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import { getLockSuggestions, getMonthlySummary, getSyncRuns } from "@/lib/queries";
import { formatDateTime, monthLabel } from "@/lib/dates";
import { Badge, Card, CardHeader, Empty, Money, PageTitle } from "@/components/ui";
import { SyncButtons } from "@/components/admin-forms";
import { lockMonthAction, unlockMonthAction } from "../actions";

export default async function MonthsPage() {
  await requireAdmin();
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title="Måneder og synk" lead="Der er ingen aktiv sæson endnu." />
      </div>
    );
  }

  const [months, runs, lockable] = await Promise.all([
    getMonthlySummary(season.id),
    getSyncRuns(),
    getLockSuggestions(season.id),
  ]);
  // Måneder hvor alle har betalt — det er gratis at lukke dem nu.
  const settled = new Set(lockable.map((m) => m.monthKey));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-[14px] text-ink-soft underline">
          ← Admin
        </Link>
        <PageTitle
          title="Måneder og synk"
          lead="Luk en måned når den er gjort op — så kan tallene ikke ændre sig bagefter."
        />
      </div>

      <Card>
        <CardHeader title="Hent kampe" />
        <SyncButtons />
        <p className="px-4 pb-4 text-[13px] text-ink-soft">
          Kampene hentes automatisk hver nat. Knappen her er til når du ikke kan vente.
        </p>
      </Card>

      <Card>
        <CardHeader title="Måneder" />
        {months.length === 0 ? (
          <Empty>Ingen posteringer endnu.</Empty>
        ) : (
          <ul>
            {[...months].reverse().map((month) => (
              <li
                key={month.monthKey}
                className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3 last:border-b-0"
              >
                <div>
                  <div className="flex items-center gap-2 text-[15px]">
                    {monthLabel(month.monthKey)}
                    {month.locked ? <Badge>Lukket</Badge> : null}
                  </div>
                  <div className="text-[13px] text-ink-soft">
                    Opkrævet <Money ore={month.chargedOre} colored={false} className="text-[13px]" /> ·
                    indbetalt <Money ore={month.paidOre} colored={false} className="text-[13px]" />
                  </div>
                  {settled.has(month.monthKey) ? (
                    <div className="text-[13px] text-credit">
                      Alle har betalt — måneden kan lukkes.
                    </div>
                  ) : null}
                </div>
                {month.locked ? (
                  <form action={unlockMonthAction}>
                    <input type="hidden" name="monthKey" value={month.monthKey} />
                    <button type="submit" className="text-[13px] text-ink-soft underline">
                      Åbn igen
                    </button>
                  </form>
                ) : (
                  <form action={lockMonthAction}>
                    <input type="hidden" name="monthKey" value={month.monthKey} />
                    <button type="submit" className="text-[13px] text-ink-soft underline">
                      Luk måneden
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Seneste synkroniseringer" />
        {runs.length === 0 ? (
          <Empty>Der er ikke hentet kampe endnu.</Empty>
        ) : (
          <ul>
            {runs.map((run) => (
              <li key={run.id} className="border-b border-rule-soft px-4 py-2.5 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span>{formatDateTime(run.startedAt)}</span>
                  <span className="text-ink-soft">{run.trigger}</span>
                </div>
                <div className="text-[13px] text-ink-soft">
                  {run.error ? (
                    <span className="text-debt">{run.error}</span>
                  ) : run.finishedAt ? (
                    `${run.matchesUpserted} kampe · ${run.entriesCreated} nye opkrævninger`
                  ) : (
                    "Kører ..."
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
