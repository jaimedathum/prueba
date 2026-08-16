import type { Sql } from "postgres";

/**
 * Una base de datos desechable por fichero de test.
 *
 * Vitest corre los ficheros **en paralelo**, así que dos pruebas de
 * integración que recreen el esquema sobre la misma base se pisan entre ellas:
 * una borra las tablas mientras la otra las está usando, y el fallo sale en un
 * sitio distinto cada vez. Un test que falla a ratos es peor que no tenerlo,
 * porque enseña a ignorarlo.
 *
 * Aislar por esquema no vale: las migraciones referencian `"public"` de forma
 * explícita en las claves ajenas. Así que cada fichero se lleva su propia base
 * de datos, creada al empezar y borrada al terminar.
 *
 * No es código de producción; vive en `lib/` sin `.test.` en el nombre para
 * que vitest no intente ejecutarlo como suite.
 */

export interface TestDatabase {
  url: string;
  close: () => Promise<void>;
}

function databaseUrlFor(base: string, name: string): string {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function createTestDatabase(
  name: string,
  baseUrl = process.env.TEST_DATABASE_URL!,
): Promise<TestDatabase> {
  const postgres = (await import("postgres")).default;
  const dbName = `fantasy_test_${name}`;

  // Conexión de mantenimiento: no se puede crear ni borrar la base a la que
  // estás conectado.
  const admin: Sql = postgres(baseUrl, { max: 1, prepare: false });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  return {
    url: databaseUrlFor(baseUrl, dbName),
    async close() {
      const cleanup: Sql = postgres(baseUrl, { max: 1, prepare: false });
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
