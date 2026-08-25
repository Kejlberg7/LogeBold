<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# LogeBold

Next.js 16 (App Router) + Drizzle + Postgres. Dansk brugerflade.

## Regler i koden

- **Penge er heltal i øre.** Aldrig kommatal. `src/lib/money.ts` formaterer og
  parser dansk input ("25,50").
- **Måneder beregnes i dansk tid**, ikke UTC — se `src/lib/dates.ts`. Aggregeringer
  i SQL bruger `at time zone 'Europe/Copenhagen'`.
- **Kampopkrævninger er afledt data.** `recalcCharges()` i `src/lib/sync.ts` kan
  altid køres forfra og er idempotent. Manuelle posteringer røres aldrig af den.
- **Lukkede måneder er urørlige.** Både `recalcCharges()` og admin-handlingerne
  tjekker `month_locks`, før de skriver.
- **Flere medlemmer kan dele et hold.** Nøglen for en kampopkrævning er
  (kamp, hold, medlem) — ikke (kamp, hold).
- Manuelle posteringer slettes ikke; de modposteres via `reversesEntryId`.

## Struktur

| Sti | Indhold |
| --- | --- |
| `src/db/schema.ts` | Tabeller |
| `src/lib/sync.ts` | Hentning fra football-data.org og beregning af opkrævninger |
| `src/lib/queries.ts` | Læsemodeller til siderne |
| `src/lib/auth.ts` | Loginkode i en signeret cookie (jose) |
| `src/app/admin/actions.ts` | Alle skrivende handlinger, alle bag `requireAdmin()` |
