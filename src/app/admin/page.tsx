import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import {
  getActiveMemberOptions,
  getFineTypes,
  getMonthlyMemberTotals,
  getPotSummary,
  getRecentManualEntries,
  getStandings,
} from "@/lib/queries";
import { formatDate, monthLabel, toDateInputValue } from "@/lib/dates";
import { Card, CardHeader, Empty, Money, PageTitle, Stat } from "@/components/ui";
import { AdjustmentForm, FineForm, PaymentForm } from "@/components/admin-forms";
import { PaymentRequest, type RequestList } from "@/components/payment-request";
import { reverseEntryAction } from "./actions";

const TYPE_LABELS = {
  match: "Kamp",
  fine: "Bøde",
  payment: "Indbetaling",
  adjustment: "Regulering",
} as const;

export default async function AdminPage() {
  await requireAdmin();
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title="Admin" lead="Der er ingen aktiv sæson endnu." />
        <Card className="p-5 text-[15px]">
          Start med at oprette sæsonen under{" "}
          <Link href="/admin/satser" className="text-debt underline">
            Satser og sæson
          </Link>
          .
        </Card>
      </div>
    );
  }

  const [pot, memberOptions, fines, recent, standings, monthlyTotals] = await Promise.all([
    getPotSummary(season.id),
    getActiveMemberOptions(),
    getFineTypes(season.id),
    getRecentManualEntries(season.id),
    getStandings(season.id),
    getMonthlyMemberTotals(season.id),
  ]);

  const today = toDateInputValue(new Date());

  // Listen admin sender ud: navn og beløb, klar til at kopiere.
  const outstanding: RequestList = {
    key: "skyldig",
    label: "Alt skyldigt",
    heading: `Logen ${season.name} — skyldige beløb`,
    lines: standings
      .filter((s) => s.balanceOre > 0)
      .sort((a, b) => b.balanceOre - a.balanceOre)
      .map((s) => ({
        name: s.name,
        ore: s.balanceOre,
        parts: [
          { label: "Kampe", ore: s.matchOre },
          { label: "Bøder", ore: s.fineOre },
          { label: "Reguleringer", ore: s.adjustmentOre },
          { label: "Betalt", ore: -s.paidOre },
        ],
      })),
  };

  const nameById = new Map(standings.map((s) => [s.memberId, s.name]));
  const monthLists: RequestList[] = [...monthlyTotals.keys()]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 6)
    .map((key) => ({
      key,
      label: monthLabel(key),
      heading: `Logen ${season.name} — opkrævet i ${monthLabel(key)}`,
      lines: [...(monthlyTotals.get(key) ?? new Map())]
        .map(([memberId, totals]) => ({
          name: nameById.get(memberId) ?? "Ukendt",
          ore: totals.chargedOre,
          parts: [
            { label: "Opkrævet", ore: totals.chargedOre },
            { label: "Betalt", ore: -totals.paidOre },
          ],
        }))
        .filter((line) => line.ore > 0)
        .sort((a, b) => b.ore - a.ore),
    }));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Admin" lead={`${season.name} · ${pot.memberCount} medlemmer`} />

      <nav className="flex flex-wrap gap-2 text-[14px]">
        <Link href="/admin/medlemmer" className="rounded-md border border-rule px-3 py-1.5 text-ink-soft hover:text-ink">
          Medlemmer og hold
        </Link>
        <Link href="/admin/satser" className="rounded-md border border-rule px-3 py-1.5 text-ink-soft hover:text-ink">
          Satser og sæson
        </Link>
        <Link href="/admin/maaneder" className="rounded-md border border-rule px-3 py-1.5 text-ink-soft hover:text-ink">
          Måneder og synk
        </Link>
      </nav>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="I kassen" ore={pot.potOre} tone="credit" />
        <Stat label="Udestående" ore={pot.outstandingOre} tone="debt" />
      </div>

      <Card>
        <CardHeader title="Opgørelse til logen" />
        <PaymentRequest lists={[outstanding, ...monthLists]} />
        <p className="px-4 pb-4 text-[13px] text-ink-soft">
          <strong className="font-semibold">Alt skyldigt</strong> er hele det udestående beløb —
          også fra tidligere måneder, og også for runder der falder hen over et månedsskifte.
          Det er den liste, der skal sendes ud. Månederne ved siden af viser kun, hvad der blev
          opkrævet i netop den måned.
        </p>
      </Card>

      <Card>
        <CardHeader title="Registrér indbetaling" />
        <PaymentForm members={memberOptions} today={today} />
      </Card>

      <Card>
        <CardHeader title="Giv bøde" />
        <FineForm members={memberOptions} fineTypes={fines} today={today} />
      </Card>

      <Card>
        <CardHeader title="Seneste posteringer" />
        {recent.length === 0 ? (
          <Empty>Du har ikke registreret noget endnu.</Empty>
        ) : (
          <ul>
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="flex items-baseline justify-between gap-3 border-b border-rule-soft px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px]">
                    {entry.memberName} <span className="text-ink-soft">· {entry.description}</span>
                  </div>
                  <div className="text-[13px] text-ink-soft">
                    {formatDate(entry.occurredAt)} · {TYPE_LABELS[entry.type]}
                    {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  <Money ore={entry.amountOre} className="text-[15px]" />
                  {entry.reversesEntryId === null ? (
                    <form action={reverseEntryAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <button type="submit" className="text-[13px] text-ink-soft underline">
                        Annullér
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Regulering" />
        <AdjustmentForm members={memberOptions} today={today} />
      </Card>

      <p className="text-[13px] text-ink-soft">
        Posteringer slettes aldrig. Annullerer du én, laves der en modpostering, så historikken
        bliver stående.
      </p>
    </div>
  );
}
