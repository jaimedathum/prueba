import type { Config } from "drizzle-kit";
import { findDirectDatabaseUrl } from "./lib/db/config";

/**
 * Las migraciones van por la conexión **directa**, no por la pooled.
 *
 * PgBouncer en modo transacción —lo que hay detrás de `DATABASE_URL` en Neon—
 * no lleva bien el DDL. Neon publica la directa como `DATABASE_URL_UNPOOLED`,
 * así que basta con tenerla en el entorno: esto la elige solo y cae a
 * `DATABASE_URL` cuando no existe, que es el caso de un Postgres local.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Vacío en vez de error: `db:generate` solo lee el esquema y no debe
    // exigir una base de datos. `db:migrate` sí, y falla él con su mensaje.
    url: findDirectDatabaseUrl(process.env) ?? "",
  },
} satisfies Config;
