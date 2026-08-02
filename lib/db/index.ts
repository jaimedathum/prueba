import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: postgres.Sql | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Conexión perezosa: así los tests y los módulos que solo importan tipos no
 * necesitan una base de datos levantada.
 */
export function getDb() {
  if (!database) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "Falta DATABASE_URL. Copia .env.example a .env y rellénala.",
      );
    }
    client = postgres(url, { max: 5 });
    database = drizzle(client, { schema });
  }
  return database;
}

export async function closeDb() {
  await client?.end();
  client = undefined;
  database = undefined;
}

export { schema };
