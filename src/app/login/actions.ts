"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { normalizeCode, signIn, signOut } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (code.length === 0) return { error: "Skriv din loginkode." };

  const [member] = await db
    .select({ id: members.id, isActive: members.isActive })
    .from(members)
    .where(eq(members.loginCode, code))
    .limit(1);

  if (!member) return { error: "Koden passer ikke på nogen i logen." };
  if (!member.isActive) return { error: "Din profil er sat på pause. Spørg admin." };

  await signIn(member.id);
  redirect("/");
}

/** Førstegangsopsætning: den første bruger på en tom database bliver admin. */
export async function bootstrapAdminAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim();
  const code = normalizeCode(String(formData.get("code") ?? ""));

  if (name.length < 2) return { error: "Skriv dit navn." };
  if (code.length < 4) return { error: "Vælg en kode på mindst 4 tegn." };

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(members);
  if (count > 0) return { error: "Logen er allerede sat op. Log ind med din kode." };

  const [member] = await db
    .insert(members)
    .values({ name, loginCode: code, isAdmin: true })
    .returning({ id: members.id });

  await signIn(member.id);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
