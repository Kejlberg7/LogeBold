/** Genberegner kampopkrævninger for den aktive sæson. */
import { getActiveSeason, recalcCharges } from "../src/lib/sync";

async function main() {
  const season = await getActiveSeason();
  if (!season) {
    console.error("Ingen aktiv sæson.");
    process.exit(1);
  }
  console.log(await recalcCharges(season.id));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
