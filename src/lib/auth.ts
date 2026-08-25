import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";

const COOKIE = "loge_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET mangler eller er for kort.");
  }
  return new TextEncoder().encode(value);
}

export type Session = {
  id: number;
  name: string;
  isAdmin: boolean;
};

/** Loginkoder skrives som "AB3K7Q" uanset hvordan de tastes. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function signIn(memberId: number): Promise<void> {
  const token = await new SignJWT({ sub: String(memberId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Rettigheder læses fra databasen hver gang, så en fjernet admin mister adgang med det samme. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const memberId = Number(payload.sub);
    if (!Number.isInteger(memberId)) return null;

    const [member] = await db
      .select({
        id: members.id,
        name: members.name,
        isAdmin: members.isAdmin,
        isActive: members.isActive,
      })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);

    if (!member || !member.isActive) return null;
    return { id: member.id, name: member.name, isAdmin: member.isAdmin };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/");
  return session;
}
