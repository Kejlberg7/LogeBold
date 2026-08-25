/** Henter hold og kampe fra football-data.org og genberegner opkrævninger. */
import { runSync } from "../src/lib/sync";

async function main() {
  console.log(await runSync("kommandolinje"));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
