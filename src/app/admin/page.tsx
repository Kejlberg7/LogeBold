import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import {
  getActiveMemberOptions,
  getFineTypes,
  getPotSummary,
  getRecentManualEntries,
} from "@/lib/queries";
import { formatDate, toDateInputValue } from "@/lib/dates";
import { Card, CardHeader, Empty, Money, PageTitle, Stat } from "@/components/ui";
import { AdjustmentForm, FineForm, PaymentForm } from "@/components/admin-forms";
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

  const [pot, memberOptions, fines, recent] = await Promise.all([
    getPotSummary(season.id),
    getActiveMemberOptions(),
    getFineTypes(season.id),
    getRecentManualEntries(season.id),
  ]);

  const today = toDateInputValue(new Date());


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
