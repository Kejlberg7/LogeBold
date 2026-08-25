import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveSeason } from "@/lib/sync";
import {
  getLockedMonths,
  getMemberById,
  getMemberEntries,
  getStandings,
  type LedgerRow,
} from "@/lib/queries";
import { formatDate, monthKey, monthLabel } from "@/lib/dates";
import { formatOre } from "@/lib/money";
import { Badge, Card, CardHeader, Empty, Money, PageTitle, Stat } from "@/components/ui";

const TYPE_LABELS: Record<LedgerRow["type"], string> = {
  match: "Kamp",
  fine: "Bøde",
  payment: "Indbetaling",
  adjustment: "Regulering",
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

  const [entries, standings, locked] = await Promise.all([
    getMemberEntries(season.id, memberId),
    getStandings(season.id),
    getLockedMonths(season.id),
  ]);

  const stats = standings.find((s) => s.memberId === memberId);

  const byMonth = new Map<string, LedgerRow[]>();
  for (const entry of entries) {
    const key = monthKey(entry.occurredAt);
    const list = byMonth.get(key) ?? [];
    list.push(entry);
    byMonth.set(key, list);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  const draws = entries.filter((e) => e.description.startsWith("Uafgjort")).length;
  const losses = entries.filter((e) => e.description.startsWith("Nederlag")).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/tabel" className="text-[14px] text-ink-soft underline">
          ← Stilling
        </Link>
        <PageTitle
          title={member.name}
          lead={stats?.teams.map((t) => t.shortName).join(" og ") || "Har ikke fået hold endnu."}
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
          hint={`Opkrævet ${formatOre((stats?.matchOre ?? 0) + (stats?.fineOre ?? 0))}`}
        />
      </div>

      <Card>
        <CardHeader title="Sæsonen indtil nu" />
        <dl className="grid grid-cols-2 gap-px overflow-hidden bg-rule-soft sm:grid-cols-4">
          {[
            { label: "Uafgjorte", value: String(draws) },
            { label: "Nederlag", value: String(losses) },
            { label: "Kampe", value: formatOre(stats?.matchOre ?? 0) },
            { label: "Bøder", value: formatOre(stats?.fineOre ?? 0) },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
              <dt className="label">{item.label}</dt>
              <dd className="num text-[17px]">{item.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {months.length === 0 ? (
        <Card>
          <Empty>Ingen posteringer endnu.</Empty>
        </Card>
      ) : (
        months.map((key) => {
          const rows = byMonth.get(key)!;
          const total = rows.reduce((sum, r) => sum + r.amountOre, 0);
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
              <ul>
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-baseline justify-between gap-3 border-b border-rule-soft px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[15px]">{row.description}</div>
                      <div className="text-[13px] text-ink-soft">
                        {formatDate(row.occurredAt)} · {TYPE_LABELS[row.type]}
                        {row.paymentMethod ? ` · ${row.paymentMethod}` : ""}
                        {row.matchday ? ` · runde ${row.matchday}` : ""}
                      </div>
                    </div>
                    <Money ore={row.amountOre} className="shrink-0 text-[15px]" />
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
