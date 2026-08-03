/**
 * Resolución de la conexión a Postgres.
 *
 * Vive aparte de `index.ts` y no toca la red ni lee `process.env` por su
 * cuenta: todo entra por parámetro para poder testearlo sin base de datos.
 *
 * El despliegue de referencia es **Neon a través del Marketplace de Vercel**,
 * que inyecta las variables solo. Eso obliga a distinguir dos conexiones que
 * no son intercambiables:
 *
 * - **Pooled** (`DATABASE_URL`): pasa por PgBouncer en modo transacción. Es la
 *   que debe usar la app en serverless, donde cada invocación es un proceso
 *   nuevo y abrir conexiones directas agota el límite del servidor.
 * - **Directa** (`DATABASE_URL_UNPOOLED`): sin pooler. Es la que necesitan las
 *   migraciones, porque PgBouncer en modo transacción no lleva bien el DDL.
 *
 * Usar la que no toca no falla de forma limpia: falla a ratos, que es peor.
 */

export type Env = Record<string, string | undefined>;

/**
 * Alias que puede inyectar el entorno, en orden de preferencia. Los
 * `POSTGRES_*` son la convención que heredó la integración de Vercel del
 * antiguo Vercel Postgres, y siguen apareciendo según cómo se conecte el
 * proyecto.
 */
const POOLED_KEYS = ["DATABASE_URL", "POSTGRES_URL"] as const;
const DIRECT_KEYS = [
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

function firstNonEmpty(env: Env, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim() !== "") return value;
  }
  return null;
}

const MISSING_URL =
  "Falta DATABASE_URL. Si despliegas en Vercel, créala en Storage → Neon y " +
  "se inyecta sola; en local, copia .env.example a .env y rellénala.";

/** Conexión de la aplicación, o null si no hay ninguna configurada. */
export function findDatabaseUrl(env: Env): string | null {
  return firstNonEmpty(env, POOLED_KEYS);
}

/**
 * Conexión para migraciones y cualquier otro DDL, o null si no hay ninguna.
 *
 * Si no hay una directa declarada se cae a la normal: en local suelen ser la
 * misma y no tiene sentido exigir dos variables para lo mismo.
 */
export function findDirectDatabaseUrl(env: Env): string | null {
  return firstNonEmpty(env, DIRECT_KEYS) ?? findDatabaseUrl(env);
}

/**
 * Igual que `findDatabaseUrl` pero exigiéndola. Es lo que usa la app: sin
 * base de datos no hay nada que hacer, y conviene decirlo pronto y claro.
 */
export function resolveDatabaseUrl(env: Env): string {
  const url = findDatabaseUrl(env);
  if (!url) throw new Error(MISSING_URL);
  return url;
}

/** Igual que `findDirectDatabaseUrl` pero exigiéndola. */
export function resolveDirectDatabaseUrl(env: Env): string {
  const url = findDirectDatabaseUrl(env);
  if (!url) throw new Error(MISSING_URL);
  return url;
}

export interface ClientOptions {
  max: number;
  prepare: boolean;
}

/**
 * Opciones del driver `postgres-js`.
 *
 * **`prepare: false` por defecto.** `postgres-js` usa prepared statements y
 * PgBouncer en modo transacción —el que hay delante de la conexión pooled de
 * Neon y de Supabase— no los soporta. El síntoma no es un fallo al arrancar
 * sino errores intermitentes en producción, que cuestan mucho más de
 * diagnosticar que lo que ahorra tenerlos. Para esta carga —una sincronización
 * al día y un panel que se mira de vez en cuando— la diferencia de rendimiento
 * no se nota. Se puede reactivar con `DATABASE_PREPARE=true` si algún día se
 * apunta a un Postgres directo y se quiere el extra.
 *
 * **`max`**: en serverless cada instancia tiene su propio pool, así que se
 * multiplican entre sí; con el pooler delante haciendo el trabajo real, 1 es
 * lo correcto. Fuera de Vercel el proceso es único y de larga vida, y ahí sí
 * compensa un pool de verdad para que el panel no serialice sus consultas.
 */
export function resolveClientOptions(env: Env): ClientOptions {
  const isServerless = Boolean(env.VERCEL);
  const configuredMax = Number(env.DATABASE_POOL_MAX);

  return {
    max: Number.isFinite(configuredMax) && configuredMax > 0
      ? configuredMax
      : isServerless
        ? 1
        : 5,
    prepare: env.DATABASE_PREPARE === "true",
  };
}
