#!/usr/bin/env tsx
/**
 * Migraciones, pensadas para correr en el build del despliegue.
 *
 *   npm run db:deploy
 *
 * Va aquí y no en `drizzle-kit migrate` por dos motivos:
 *
 * 1. Usa el migrador programático de `drizzle-orm`, que es una dependencia de
 *    producción. Así no depende de que el entorno de build conserve las
 *    devDependencies.
 * 2. Puede decidir **no hacer nada** cuando no hay base de datos configurada,
 *    en vez de romper el build. Eso permite colgarlo del `build` sin que un
 *    `npm run build` en un portátil sin `.env` deje de funcionar.
 *
 * Usa la conexión **directa**: PgBouncer en modo transacción no lleva bien el
 * DDL. Ver `lib/db/config.ts`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { findDirectDatabaseUrl } from "@/lib/db/config";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables del entorno tal cual. Es el caso normal
  // en Vercel, donde las inyecta la plataforma.
}

async function main(): Promise<void> {
  const url = findDirectDatabaseUrl(process.env);

  if (!url) {
    // Ni error ni silencio: se dice qué se ha saltado y por qué.
    console.log(
      "Sin DATABASE_URL configurada: se saltan las migraciones.\n" +
        "Si esto es un despliegue, revisa las variables de entorno del proyecto.",
    );
    return;
  }

  // max 1 y sin prepared statements: una sola pasada de DDL, sin pooler.
  const client = postgres(url, { max: 1, prepare: false });

  try {
    console.log("Aplicando migraciones pendientes...");
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("Base de datos al día.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    `\nFallo al migrar: ${error instanceof Error ? error.message : String(error)}`,
  );
  // Sí se rompe el build: desplegar contra un esquema viejo da errores mucho
  // más difíciles de leer que este, del tipo `relation "..." does not exist`.
  process.exitCode = 1;
});
