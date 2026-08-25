import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kaldes af Vercel Cron hver nat. Beskyttet af CRON_SECRET, så andre ikke kan
 * sætte gang i hentningen og bruge vores kvote hos football-data.org.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Ikke adgang." }, { status: 401 });
  }

  try {
    const result = await runSync("natlig");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukendt fejl";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
