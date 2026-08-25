import { requireSession } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import {
  getLockedMonths,
  getMemberEntries,
  getStandings,
  type LedgerRow,
} from "@/lib/queries";
import { formatDate, monthKey, monthLabel } from "@/lib/dates";
import { formatOre } from "@/lib/money";
import { Badge, Card, CardHeader, Empty, Money, PageTitle, Stat } from "@/components/ui";
import { logoutAction } from "@/app/login/actions";

const TYPE_LABELS: Record<LedgerRow["type"], string> = {
  match: "Kamp",
  fine: "Bøde",
  payment: "Indbetaling",
  adjustment: "Regulering",
};

export default async function MyPage() {
  const session = await requireSession();
  const season = await getActiveSeason();

  if (!season) {
    return <PageTitle title="Min side" lead="Sæsonen er ikke sat op endnu." />;
  }

  const [entries, standings, locked] = await Promise.all([
    getMemberEntries(season.id, session.id),
    getStandings(season.id),
    getLockedMonths(season.id),
  ]);

  const me = standings.find((s) => s.memberId === session.id);

  const byMonth = new Map<string, LedgerRow[]>();
  for (const entry of entries) {
    const key = monthKey(entry.occurredAt);
    const list = byMonth.get(key) ?? [];
    list.push(entry);
    byMonth.set(key, list);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={session.name}
        lead={me?.teams.map((t) => t.shortName).join(" og ") || "Du har ikke fået hold endnu."}
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Din saldo"
          ore={me?.balanceOre ?? 0}
          tone={(me?.balanceOre ?? 0) > 0 ? "debt" : "credit"}
          hint={(me?.balanceOre ?? 0) > 0 ? "Skal betales" : "Intet udestående"}
        />
        <Stat
          label="Betalt i alt"
          ore={me?.paidOre ?? 0}
          tone="credit"
          hint={`Opkrævet ${formatOre((me?.matchOre ?? 0) + (me?.fineOre ?? 0))}`}
        />
      </div>

      {months.length === 0 ? (
        <Card>
          <Empty>Ingen posteringer endnu. Held og lykke.</Empty>
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

      <form action={logoutAction}>
        <button type="submit" className="text-[14px] text-ink-soft underline">
          Log ud
        </button>
      </form>
    </div>
  );
}
