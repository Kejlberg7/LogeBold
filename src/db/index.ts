import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Hot reload i udvikling må ikke åbne en ny pulje for hver ændring.
const globalForDb = globalThis as unknown as {
  logeboldClient?: ReturnType<typeof postgres>;
  logeboldDb?: Db;
};

/**
 * Forbindelsen laves først, når der rent faktisk skal læses eller skrives.
 * Ellers ville `next build` kræve en database at bygge imod, og en import
 * uden miljøvariabler ville fejle allerede under bygningen i stedet for at
 * sige klart fra, når siden bliver kaldt.
 */
function connect(): Db {
  if (globalForDb.logeboldDb) return globalForDb.logeboldDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL mangler. Sæt den i .env.local lokalt, eller som miljøvariabel hos hostingudbyderen.",
    );
  }

  const client =
    globalForDb.logeboldClient ??
    postgres(connectionString, {
      prepare: false,
      max: process.env.NODE_ENV === "production" ? 5 : 2,
    });

  const instance = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.logeboldClient = client;
    globalForDb.logeboldDb = instance;
  }

  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, property) {
    const instance = connect();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
