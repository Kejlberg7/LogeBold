import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL mangler. Se .env.example.");
}

// Hot reload i udvikling må ikke åbne en ny pulje for hver ændring.
const globalForDb = globalThis as unknown as {
  logeboldClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.logeboldClient ??
  postgres(connectionString, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 5 : 2,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.logeboldClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
