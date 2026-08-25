import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import { getFineTypes, getPayouts, getPotSummary, getSeasonList } from "@/lib/queries";
import { formatDate, toDateInputValue } from "@/lib/dates";
import { formatOre } from "@/lib/money";
import { Badge, Card, CardHeader, Empty, Money, PageTitle } from "@/components/ui";
import {
  CreateSeasonForm,
  FineTypeForm,
  PayoutForm,
  SeasonForm,
} from "@/components/admin-forms";
import { activateSeasonAction, deleteFineTypeAction, deletePayoutAction } from "../actions";

export default async function RatesPage() {
  await requireAdmin();
  const season = await getActiveSeason();
  const seasonList = await getSeasonList();

  const [fines, payoutRows, pot] = season
    ? await Promise.all([
        getFineTypes(season.id),
        getPayouts(season.id),
        getPotSummary(season.id),
      ])
    : [[], [], null];

  const today = toDateInputValue(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-[14px] text-ink-soft underline">
          ← Admin
        </Link>
        <PageTitle title="Satser og sæson" lead="Hvad koster uafgjort, nederlag og bøder." />
      </div>

      {season ? (
        <Card>
          <CardHeader title="Denne sæson" />
          <SeasonForm season={season} />
        </Card>
      ) : null}

      {season ? (
        <Card>
          <CardHeader title="Bødetyper" />
          <div className="flex flex-col gap-4 p-4">
            <p className="text-[13px] text-ink-soft">
              Genveje når du giver en bøde. Beløbet kan altid rettes i det enkelte tilfælde.
            </p>
            {fines.map((fine) => (
              <div key={fine.id} className="flex flex-col gap-1 border-t border-rule-soft pt-3">
                <FineTypeForm fineType={fine} />
                <form action={deleteFineTypeAction}>
                  <input type="hidden" name="id" value={fine.id} />
                  <button type="submit" className="text-[13px] text-ink-soft underline">
                    Fjern
                  </button>
                </form>
              </div>
            ))}
            <div className="border-t border-rule-soft pt-3">
              <FineTypeForm />
            </div>
          </div>
        </Card>
      ) : null}

      {season && pot ? (
        <Card>
          <CardHeader
            title="Udbetalinger fra kassen"
            action={<span className="num text-[14px] text-ink-soft">{formatOre(pot.potOre)} tilbage</span>}
          />
          <PayoutForm today={today} />
          {payoutRows.length === 0 ? (
            <Empty>Der er ikke udbetalt noget endnu.</Empty>
          ) : (
            <ul className="border-t border-rule-soft">
              {payoutRows.map((payout) => (
                <li
                  key={payout.id}
                  className="flex items-baseline justify-between gap-3 border-b border-rule-soft px-4 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[15px]">{payout.description}</div>
                    <div className="text-[13px] text-ink-soft">{formatDate(payout.occurredAt)}</div>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3">
                    <Money ore={payout.amountOre} colored={false} className="text-[15px]" />
                    <form action={deletePayoutAction}>
                      <input type="hidden" name="id" value={payout.id} />
                      <button type="submit" className="text-[13px] text-ink-soft underline">
                        Fjern
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader title={season ? "Ny sæson" : "Opret sæson"} />
        <CreateSeasonForm />
      </Card>

      {seasonList.length > 1 ? (
        <Card>
          <CardHeader title="Alle sæsoner" />
          <ul>
            {seasonList.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3 last:border-b-0"
              >
                <div>
                  <div className="text-[15px]">{s.name}</div>
                  <div className="text-[13px] text-ink-soft">
                    Uafgjort {formatOre(s.drawFeeOre)} · nederlag {formatOre(s.lossFeeOre)}
                  </div>
                </div>
                {s.isActive ? (
                  <Badge tone="credit">Aktiv</Badge>
                ) : (
                  <form action={activateSeasonAction}>
                    <input type="hidden" name="seasonId" value={s.id} />
                    <button type="submit" className="text-[13px] text-ink-soft underline">
                      Gør aktiv
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
