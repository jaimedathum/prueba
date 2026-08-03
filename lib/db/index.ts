import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolveClientOptions, resolveDatabaseUrl } from "./config";
import * as schema from "./schema";

let client: postgres.Sql | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Conexión perezosa: así los tests y los módulos que solo importan tipos no
 * necesitan una base de datos levantada.
 *
 * La URL y las opciones del driver se resuelven en `config.ts`, que explica
 * por qué son las que son (resumen: conexión pooled y sin prepared statements,
 * porque detrás hay un PgBouncer en modo transacción).
 */
export function getDb() {
  if (!database) {
    const url = resolveDatabaseUrl(process.env);
    client = postgres(url, resolveClientOptions(process.env));
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
