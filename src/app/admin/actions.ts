"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  fineTypes,
  ledgerEntries,
  matches,
  members,
  monthLocks,
  payouts,
  seasons,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { parseKrToOre } from "@/lib/money";
import { fromDateInputValue, monthKey } from "@/lib/dates";
import { getActiveSeason, recalcCharges, runSync } from "@/lib/sync";
import { getLockedMonths, getMatchBilling } from "@/lib/queries";

export type ActionState = { error?: string; ok?: string };

function refresh() {
  revalidatePath("/", "layout");
}

async function assertMonthOpen(seasonId: number, date: Date): Promise<string | null> {
  const key = monthKey(date);
  const [lock] = await db
    .select({ id: monthLocks.id })
    .from(monthLocks)
    .where(and(eq(monthLocks.seasonId, seasonId), eq(monthLocks.monthKey, key)))
    .limit(1);
  return lock ? `Måneden ${key} er lukket. Åbn den først, hvis du skal rette i den.` : null;
}

function readAmount(formData: FormData, field = "amount"): number | null {
  return parseKrToOre(String(formData.get(field) ?? ""));
}

function readDate(formData: FormData, field = "date"): Date | null {
  const raw = String(formData.get(field) ?? "");
  return raw ? fromDateInputValue(raw) : new Date();
}

/* ------------------------------------------------------------------ betalinger */

export async function registerPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };

  const memberId = Number(formData.get("memberId"));
  const amountOre = readAmount(formData);
  const date = readDate(formData);
  const method = String(formData.get("method") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!Number.isInteger(memberId)) return { error: "Vælg et medlem." };
  if (amountOre === null || amountOre <= 0) return { error: "Skriv et beløb større end 0." };
  if (!date) return { error: "Ugyldig dato." };

  const locked = await assertMonthOpen(season.id, date);
  if (locked) return { error: locked };

  await db.insert(ledgerEntries).values({
    seasonId: season.id,
    memberId,
    type: "payment",
    amountOre: -amountOre,
    occurredAt: date,
    description: "Indbetaling",
    paymentMethod: method,
    note,
    createdByMemberId: admin.id,
  });

  refresh();
  return { ok: "Indbetalingen er registreret." };
}

/* ----------------------------------------------------------------------- bøder */

export async function registerFineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };

  const memberId = Number(formData.get("memberId"));
  const amountOre = readAmount(formData);
  const date = readDate(formData);
  const description = String(formData.get("description") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!Number.isInteger(memberId)) return { error: "Vælg et medlem." };
  if (amountOre === null || amountOre <= 0) return { error: "Skriv et beløb større end 0." };
  if (description.length < 2) return { error: "Skriv hvad bøden er for." };
  if (!date) return { error: "Ugyldig dato." };

  const locked = await assertMonthOpen(season.id, date);
  if (locked) return { error: locked };

  await db.insert(ledgerEntries).values({
    seasonId: season.id,
    memberId,
    type: "fine",
    amountOre,
    occurredAt: date,
    description,
    note,
    createdByMemberId: admin.id,
  });

  refresh();
  return { ok: "Bøden er registreret." };
}

/* ----------------------------------------------------------------- reguleringer */

export async function registerAdjustmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };

  const memberId = Number(formData.get("memberId"));
  const amountOre = readAmount(formData);
  const date = readDate(formData);
  const description = String(formData.get("description") ?? "").trim();

  if (!Number.isInteger(memberId)) return { error: "Vælg et medlem." };
  if (amountOre === null || amountOre === 0) {
    return { error: "Skriv et beløb. Minus giver medlemmet en rabat." };
  }
  if (description.length < 2) return { error: "Skriv en begrundelse." };
  if (!date) return { error: "Ugyldig dato." };

  const locked = await assertMonthOpen(season.id, date);
  if (locked) return { error: locked };

  await db.insert(ledgerEntries).values({
    seasonId: season.id,
    memberId,
    type: "adjustment",
    amountOre,
    occurredAt: date,
    description,
    createdByMemberId: admin.id,
  });

  refresh();
  return { ok: "Reguleringen er registreret." };
}

/**
 * Manuelle posteringer slettes aldrig — de modposteres, så historikken bliver stående.
 */
export async function reverseEntryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const entryId = Number(formData.get("entryId"));
  if (!Number.isInteger(entryId)) return;

  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, entryId))
    .limit(1);
  if (!entry || entry.type === "match") return;

  const locked = await assertMonthOpen(entry.seasonId, entry.occurredAt);
  if (locked) return;

  await db.insert(ledgerEntries).values({
    seasonId: entry.seasonId,
    memberId: entry.memberId,
    type: entry.type,
    amountOre: -entry.amountOre,
    occurredAt: new Date(),
    description: `Annulleret: ${entry.description}`,
    reversesEntryId: entry.id,
    createdByMemberId: admin.id,
  });

  refresh();
}

/* --------------------------------------------------------------------- sæsonen */

export async function updateSeasonAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const seasonId = Number(formData.get("seasonId"));
  const name = String(formData.get("name") ?? "").trim();
  const drawOre = readAmount(formData, "draw");
  const lossOre = readAmount(formData, "loss");

  if (!Number.isInteger(seasonId)) return { error: "Ukendt sæson." };
  if (name.length < 2) return { error: "Sæsonen skal have et navn." };
  if (drawOre === null || drawOre < 0) return { error: "Ugyldigt beløb for uafgjort." };
  if (lossOre === null || lossOre < 0) return { error: "Ugyldigt beløb for nederlag." };

  await db
    .update(seasons)
    .set({ name, drawFeeOre: drawOre, lossFeeOre: lossOre })
    .where(eq(seasons.id, seasonId));

  // Nye satser slår igennem på alle måneder der ikke er lukket.
  const recalc = await recalcCharges(seasonId);
  refresh();

  const changed = recalc.updated + recalc.created;
  return {
    ok:
      changed > 0
        ? `Gemt. ${changed} kampopkrævninger er regnet om.`
        : recalc.skippedLocked > 0
          ? `Gemt. ${recalc.skippedLocked} posteringer i lukkede måneder blev ikke rørt.`
          : "Gemt.",
  };
}

export async function createSeasonAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const year = Number(formData.get("year"));
  const drawOre = readAmount(formData, "draw") ?? 2500;
  const lossOre = readAmount(formData, "loss") ?? 5000;

  if (name.length < 2) return { error: "Sæsonen skal have et navn, fx 2026/27." };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Skriv sæsonens startår, fx 2026." };
  }

  await db.update(seasons).set({ isActive: false });
  await db.insert(seasons).values({
    name,
    apiSeasonYear: year,
    drawFeeOre: drawOre,
    lossFeeOre: lossOre,
    isActive: true,
  });

  refresh();
  return { ok: "Sæsonen er oprettet og sat som aktiv." };
}

export async function activateSeasonAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const seasonId = Number(formData.get("seasonId"));
  if (!Number.isInteger(seasonId)) return;
  await db.update(seasons).set({ isActive: false });
  await db.update(seasons).set({ isActive: true }).where(eq(seasons.id, seasonId));
  refresh();
}

/* ------------------------------------------------------------------ bødetyper */

export async function saveFineTypeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const amountOre = readAmount(formData);

  if (name.length < 2) return { error: "Bødetypen skal have et navn." };
  if (amountOre === null || amountOre <= 0) return { error: "Skriv et beløb." };

  if (Number.isInteger(id) && id > 0) {
    await db
      .update(fineTypes)
      .set({ name, defaultAmountOre: amountOre })
      .where(eq(fineTypes.id, id));
  } else {
    await db
      .insert(fineTypes)
      .values({ seasonId: season.id, name, defaultAmountOre: amountOre });
  }

  refresh();
  return { ok: "Gemt." };
}

export async function deleteFineTypeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(fineTypes).where(eq(fineTypes.id, id));
  refresh();
}

/* -------------------------------------------------------------------- medlemmer */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Skriv et navn." };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.insert(members).values({ name, loginCode: newCode() });
      refresh();
      return { ok: `${name} er oprettet.` };
    } catch {
      // Yderst sjældent kodesammenfald — prøv igen med en ny kode.
    }
  }
  return { error: "Kunne ikke lave en ledig loginkode. Prøv igen." };
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const isAdmin = formData.get("isAdmin") === "on";
  const isActive = formData.get("isActive") === "on";
  if (!Number.isInteger(id) || name.length < 2) return;

  // Der skal altid være mindst én admin tilbage.
  if (!isAdmin) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(members)
      .where(and(eq(members.isAdmin, true), eq(members.isActive, true)));
    const [current] = await db
      .select({ isAdmin: members.isAdmin })
      .from(members)
      .where(eq(members.id, id))
      .limit(1);
    if (count <= 1 && current?.isAdmin) return;
  }

  await db.update(members).set({ name, isAdmin, isActive }).where(eq(members.id, id));
  refresh();
}

export async function regenerateCodeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db.update(members).set({ loginCode: newCode() }).where(eq(members.id, id));
  refresh();
}

export async function setAssignmentsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };

  const memberId = Number(formData.get("memberId"));
  if (!Number.isInteger(memberId)) return { error: "Ukendt medlem." };

  const teamIds = formData
    .getAll("teamId")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  const unique = [...new Set(teamIds)];

  await db
    .delete(assignments)
    .where(and(eq(assignments.seasonId, season.id), eq(assignments.memberId, memberId)));

  if (unique.length > 0) {
    await db
      .insert(assignments)
      .values(unique.map((teamId) => ({ seasonId: season.id, memberId, teamId })));
  }

  // Holdskifte ændrer hvem der skylder for hvilke kampe.
  await recalcCharges(season.id);
  refresh();
  return { ok: "Holdene er gemt og pengene regnet om." };
}

/* ---------------------------------------------------------------------- måneder */

export async function lockMonthAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return;
  const key = String(formData.get("monthKey") ?? "");
  if (!/^\d{4}-\d{2}$/.test(key)) return;

  await db
    .insert(monthLocks)
    .values({ seasonId: season.id, monthKey: key, lockedByMemberId: admin.id })
    .onConflictDoNothing();
  refresh();
}

export async function unlockMonthAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return;
  const key = String(formData.get("monthKey") ?? "");
  await db
    .delete(monthLocks)
    .where(and(eq(monthLocks.seasonId, season.id), eq(monthLocks.monthKey, key)));
  refresh();
}

/* --------------------------------------------------------------- udbetalinger */

export async function addPayoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };

  const amountOre = readAmount(formData);
  const date = readDate(formData);
  const description = String(formData.get("description") ?? "").trim();

  if (amountOre === null || amountOre <= 0) return { error: "Skriv et beløb større end 0." };
  if (description.length < 2) return { error: "Skriv hvad pengene gik til." };
  if (!date) return { error: "Ugyldig dato." };

  await db.insert(payouts).values({
    seasonId: season.id,
    amountOre,
    occurredAt: date,
    description,
    createdByMemberId: admin.id,
  });

  refresh();
  return { ok: "Udbetalingen er registreret." };
}

export async function deletePayoutAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(payouts).where(eq(payouts.id, id));
  refresh();
}

/* ------------------------------------------------------------------------ synk */

export async function runSyncAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    const result = await runSync("manuel");
    refresh();
    return {
      ok: `${result.matchesUpserted} kampe hentet. ${result.recalc.created} nye opkrævninger, ${result.recalc.updated} rettet, ${result.recalc.removed} fjernet.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Synkroniseringen fejlede." };
  }
}

export async function recalcAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };
  const result = await recalcCharges(season.id);
  refresh();
  return {
    ok: `${result.created} oprettet, ${result.updated} rettet, ${result.removed} fjernet${
      result.skippedLocked > 0 ? `, ${result.skippedLocked} sprunget over (lukket måned)` : ""
    }.`,
  };
}

/* --------------------------------------------------- kampenes opkrævningsmåned */

/**
 * Flytter en kamp eller en hel runde til en anden opkrævningsmåned.
 *
 * Kampposteringerne følger med, så månedsopgørelsen og medlemssiden viser det
 * samme. Er enten den måned kampen står i nu, eller den den skal flyttes til,
 * lukket, sker der ingenting — så et lukket regnskab ikke ændrer sig bagud.
 */
export async function setBillingMonthAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "Ingen aktiv sæson." };

  const scope = String(formData.get("scope") ?? "match");
  const target = String(formData.get("month") ?? "").trim();
  if (target !== "" && !/^\d{4}-\d{2}$/.test(target)) return { error: "Ugyldig måned." };

  const rows = await getMatchBilling(season.id);

  let affected: typeof rows;
  if (scope === "round") {
    const matchday = Number(formData.get("matchday"));
    if (!Number.isInteger(matchday)) return { error: "Ugyldig runde." };
    affected = rows.filter((r) => r.matchday === matchday);
  } else {
    const matchId = Number(formData.get("matchId"));
    if (!Number.isInteger(matchId)) return { error: "Ugyldig kamp." };
    affected = rows.filter((r) => r.id === matchId);
  }
  if (affected.length === 0) return { error: "Fandt ingen kampe at flytte." };

  const locked = await getLockedMonths(season.id);
  const blocked = new Set<string>();
  for (const row of affected) {
    if (locked.has(row.billingMonth)) blocked.add(row.billingMonth);
  }
  if (target !== "" && locked.has(target)) blocked.add(target);
  if (blocked.size > 0) {
    return {
      error: `Måneden ${[...blocked].join(" og ")} er lukket. Åbn den først, hvis du skal flytte kampe ind eller ud af den.`,
    };
  }

  const ids = affected.map((r) => r.id);
  await db
    .update(matches)
    .set({ billingMonthOverride: target === "" ? null : target })
    .where(inArray(matches.id, ids));

  // Posteringerne skal stå i samme måned som kampen. Uden override falder de
  // tilbage til rundens måned, som recalcCharges regner ud.
  if (target === "") {
    await recalcCharges(season.id);
  } else {
    await db
      .update(ledgerEntries)
      .set({ billingMonth: target })
      .where(and(eq(ledgerEntries.type, "match"), inArray(ledgerEntries.matchId, ids)));
  }

  refresh();
  const what = scope === "round" ? `Runde ${affected[0].matchday}` : "Kampen";
  return {
    ok: target === "" ? `${what} følger nu runden igen.` : `${what} opkræves nu i ${target}.`,
  };
}
