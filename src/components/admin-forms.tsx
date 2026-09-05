"use client";

import { useActionState, useState } from "react";
import {
  addMemberAction,
  addPayoutAction,
  createSeasonAction,
  recalcAction,
  registerAdjustmentAction,
  registerFineAction,
  registerPaymentAction,
  runSyncAction,
  saveFineTypeAction,
  setAssignmentsAction,
  setBillingMonthAction,
  updateSeasonAction,
  type ActionState,
} from "@/app/admin/actions";
import { monthLabel } from "@/lib/dates";
import { Button, Field, inputClass } from "./ui";

const initial: ActionState = {};

function Message({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-[14px] text-debt">{state.error}</p>;
  if (state.ok) return <p className="text-[14px] text-credit">{state.ok}</p>;
  return null;
}

type MemberOption = { id: number; name: string };

function MemberSelect({ members, name = "memberId" }: { members: MemberOption[]; name?: string }) {
  return (
    <select name={name} className={inputClass} defaultValue="">
      <option value="" disabled>
        Vælg medlem
      </option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

export function PaymentForm({
  members,
  today,
  periods,
  defaultPeriod,
}: {
  members: MemberOption[];
  today: string;
  /** Perioderne der kan betales for, ældst først. */
  periods: string[];
  defaultPeriod: string | null;
}) {
  const [state, action, pending] = useActionState(registerPaymentAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Medlem">
          <MemberSelect members={members} />
        </Field>
        <Field label="Beløb i kroner">
          <input name="amount" inputMode="decimal" placeholder="250" className={`${inputClass} num`} />
        </Field>
        <Field label="Dato">
          <input type="date" name="date" defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Måde">
          <select name="method" className={inputClass} defaultValue="MobilePay">
            <option>MobilePay</option>
            <option>Bankoverførsel</option>
            <option>Kontant</option>
            <option>Andet</option>
          </select>
        </Field>
      </div>
      <Field label="Betaling for">
        <select name="period" className={inputClass} defaultValue={defaultPeriod ?? ""}>
          <option value="">Ældste gæld først</option>
          {[...periods].reverse().map((period) => (
            <option key={period} value={period}>
              {monthLabel(period)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (valgfri)">
        <input name="note" className={inputClass} placeholder="F.eks. betalt for september" />
      </Field>
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Registrerer ..." : "Registrér indbetaling"}
      </Button>
    </form>
  );
}

type FineType = { id: number; name: string; defaultAmountOre: number };

export function FineForm({
  members,
  fineTypes,
  today,
}: {
  members: MemberOption[];
  fineTypes: FineType[];
  today: string;
}) {
  const [state, action, pending] = useActionState(registerFineAction, initial);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      {fineTypes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {fineTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => {
                setDescription(type.name);
                setAmount(String(type.defaultAmountOre / 100));
              }}
              className="rounded-md border border-rule px-2.5 py-1 text-[13px] text-ink-soft hover:text-ink"
            >
              {type.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Medlem">
          <MemberSelect members={members} />
        </Field>
        <Field label="Beløb i kroner">
          <input
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className={`${inputClass} num`}
          />
        </Field>
      </div>
      <Field label="Hvad er bøden for?">
        <input
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="F.eks. mødte ikke op til lodtrækningen"
          className={inputClass}
        />
      </Field>
      <Field label="Dato">
        <input type="date" name="date" defaultValue={today} className={inputClass} />
      </Field>
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Registrerer ..." : "Giv bøde"}
      </Button>
    </form>
  );
}

export function AdjustmentForm({ members, today }: { members: MemberOption[]; today: string }) {
  const [state, action, pending] = useActionState(registerAdjustmentAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Medlem">
          <MemberSelect members={members} />
        </Field>
        <Field label="Beløb i kroner" hint="Minus giver en rabat.">
          <input name="amount" inputMode="decimal" placeholder="-50" className={`${inputClass} num`} />
        </Field>
      </div>
      <Field label="Begrundelse">
        <input name="description" className={inputClass} placeholder="F.eks. rettelse af dobbelt bøde" />
      </Field>
      <Field label="Dato">
        <input type="date" name="date" defaultValue={today} className={inputClass} />
      </Field>
      <Message state={state} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Registrerer ..." : "Registrér regulering"}
      </Button>
    </form>
  );
}

export function SeasonForm({
  season,
}: {
  season: { id: number; name: string; drawFeeOre: number; lossFeeOre: number };
}) {
  const [state, action, pending] = useActionState(updateSeasonAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      <input type="hidden" name="seasonId" value={season.id} />
      <Field label="Sæson">
        <input name="name" defaultValue={season.name} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Uafgjort koster">
          <input
            name="draw"
            inputMode="decimal"
            defaultValue={season.drawFeeOre / 100}
            className={`${inputClass} num`}
          />
        </Field>
        <Field label="Nederlag koster">
          <input
            name="loss"
            inputMode="decimal"
            defaultValue={season.lossFeeOre / 100}
            className={`${inputClass} num`}
          />
        </Field>
      </div>
      <p className="text-[13px] text-ink-soft">
        Når du ændrer satserne, regnes alle kampe i åbne måneder om med det samme. Lukkede måneder
        står fast.
      </p>
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Gemmer ..." : "Gem satser"}
      </Button>
    </form>
  );
}

export function CreateSeasonForm() {
  const [state, action, pending] = useActionState(createSeasonAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Navn">
          <input name="name" placeholder="2026/27" className={inputClass} />
        </Field>
        <Field label="Startår" hint="Sæsonen 2026/27 har startår 2026.">
          <input name="year" inputMode="numeric" placeholder="2026" className={`${inputClass} num`} />
        </Field>
        <Field label="Uafgjort koster">
          <input name="draw" inputMode="decimal" placeholder="25" className={`${inputClass} num`} />
        </Field>
        <Field label="Nederlag koster">
          <input name="loss" inputMode="decimal" placeholder="50" className={`${inputClass} num`} />
        </Field>
      </div>
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Opretter ..." : "Opret sæson"}
      </Button>
    </form>
  );
}

export function FineTypeForm({ fineType }: { fineType?: FineType }) {
  const [state, action, pending] = useActionState(saveFineTypeAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {fineType ? <input type="hidden" name="id" value={fineType.id} /> : null}
      <div className="min-w-[9rem] flex-1">
        <Field label="Bødetype">
          <input name="name" defaultValue={fineType?.name} placeholder="F.eks. betalt for sent" className={inputClass} />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Beløb">
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={fineType ? fineType.defaultAmountOre / 100 : ""}
            placeholder="50"
            className={`${inputClass} num`}
          />
        </Field>
      </div>
      <Button type="submit" variant="ghost" disabled={pending}>
        {fineType ? "Gem" : "Tilføj"}
      </Button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMemberAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 p-4">
      <div className="min-w-[10rem] flex-1">
        <Field label="Nyt medlem">
          <input name="name" placeholder="Navn" className={inputClass} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Opretter ..." : "Tilføj"}
      </Button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

export function AssignmentForm({
  memberId,
  teams,
  selected,
}: {
  memberId: number;
  teams: { id: number; shortName: string }[];
  selected: number[];
}) {
  const [state, action, pending] = useActionState(setAssignmentsAction, initial);
  const [picked, setPicked] = useState<number[]>(selected);

  const toggle = (id: number) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((t) => t !== id) : [...current, id],
    );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      {picked.map((id) => (
        <input key={id} type="hidden" name="teamId" value={id} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {teams.map((team) => {
          const on = picked.includes(team.id);
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => toggle(team.id)}
              aria-pressed={on}
              className={`rounded-md border px-2 py-1 text-[13px] transition ${
                on ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:text-ink"
              }`}
            >
              {team.shortName}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? "Gemmer ..." : "Gem hold"}
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function PayoutForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addPayoutAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Beløb i kroner">
          <input name="amount" inputMode="decimal" placeholder="1500" className={`${inputClass} num`} />
        </Field>
        <Field label="Dato">
          <input type="date" name="date" defaultValue={today} className={inputClass} />
        </Field>
      </div>
      <Field label="Hvad gik pengene til?">
        <input name="description" className={inputClass} placeholder="F.eks. sæsonafslutning" />
      </Field>
      <Message state={state} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Registrerer ..." : "Registrér udbetaling"}
      </Button>
    </form>
  );
}

export function SyncButtons() {
  const [syncState, syncAction, syncPending] = useActionState(runSyncAction, initial);
  const [recalcState, recalcActionFn, recalcPending] = useActionState(recalcAction, initial);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        <form action={syncAction}>
          <Button type="submit" disabled={syncPending}>
            {syncPending ? "Henter ..." : "Hent kampe nu"}
          </Button>
        </form>
        <form action={recalcActionFn}>
          <Button type="submit" variant="ghost" disabled={recalcPending}>
            {recalcPending ? "Regner ..." : "Genberegn penge"}
          </Button>
        </form>
      </div>
      <Message state={syncState} />
      <Message state={recalcState} />
    </div>
  );
}

/**
 * Flytter en kamp eller en hel runde til en anden opkrævningsmåned.
 * Vises kun de måneder rundens kampe faktisk ligger i — det er altid der,
 * valget står, når en weekend krydser et månedsskifte.
 */
export function BillingMonthForm({
  scope,
  matchId,
  matchday,
  current,
  options,
  overridden,
  label,
}: {
  scope: "match" | "round";
  matchId?: number;
  matchday?: number | null;
  current: string;
  options: { value: string; label: string }[];
  overridden: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState(setBillingMonthAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="scope" value={scope} />
      {matchId !== undefined ? <input type="hidden" name="matchId" value={matchId} /> : null}
      {matchday !== undefined && matchday !== null ? (
        <input type="hidden" name="matchday" value={matchday} />
      ) : null}
      <select name="month" defaultValue={overridden ? current : ""} className={inputClass}>
        <option value="">Følg runden</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
      <Message state={state} />
    </form>
  );
}
