import { describe, expect, it } from "vitest";
import {
  findDatabaseUrl,
  findDirectDatabaseUrl,
  resolveClientOptions,
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
  type Env,
} from "./config";

const POOLED = "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db";
const DIRECT = "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db";

describe("resolución de la URL", () => {
  it("usa DATABASE_URL para la aplicación", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: POOLED })).toBe(POOLED);
  });

  it("acepta POSTGRES_URL, que es lo que inyectan algunas integraciones", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: POOLED })).toBe(POOLED);
  });

  it("prefiere DATABASE_URL cuando están las dos", () => {
    const env: Env = { DATABASE_URL: POOLED, POSTGRES_URL: DIRECT };
    expect(resolveDatabaseUrl(env)).toBe(POOLED);
  });

  it("ignora una variable presente pero vacía", () => {
    const env: Env = { DATABASE_URL: "   ", POSTGRES_URL: POOLED };
    expect(resolveDatabaseUrl(env)).toBe(POOLED);
  });

  it("explica dónde crearla cuando no hay ninguna", () => {
    expect(() => resolveDatabaseUrl({})).toThrow(/Storage → Neon/);
  });

  it("devuelve null en vez de lanzar en la variante permisiva", () => {
    expect(findDatabaseUrl({})).toBeNull();
    expect(findDirectDatabaseUrl({})).toBeNull();
  });
});

describe("conexión directa para migraciones", () => {
  it("usa la unpooled cuando existe, no la pooled", () => {
    const env: Env = {
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
    };
    // Lo importante del despliegue en Neon: el DDL no puede ir por PgBouncer.
    expect(resolveDirectDatabaseUrl(env)).toBe(DIRECT);
  });

  it("acepta POSTGRES_URL_NON_POOLING como alias", () => {
    const env: Env = {
      DATABASE_URL: POOLED,
      POSTGRES_URL_NON_POOLING: DIRECT,
    };
    expect(resolveDirectDatabaseUrl(env)).toBe(DIRECT);
  });

  it("cae a la normal cuando no hay una directa declarada", () => {
    // Caso Postgres local: una sola URL para todo.
    expect(resolveDirectDatabaseUrl({ DATABASE_URL: DIRECT })).toBe(DIRECT);
  });
});

describe("opciones del driver", () => {
  it("desactiva los prepared statements por defecto", () => {
    // PgBouncer en modo transacción no los soporta y el fallo sería
    // intermitente en producción, que es el peor sitio para descubrirlo.
    expect(resolveClientOptions({}).prepare).toBe(false);
  });

  it("permite reactivarlos explícitamente", () => {
    expect(resolveClientOptions({ DATABASE_PREPARE: "true" }).prepare).toBe(
      true,
    );
  });

  it("usa una sola conexión por instancia en Vercel", () => {
    expect(resolveClientOptions({ VERCEL: "1" }).max).toBe(1);
  });

  it("usa un pool de verdad fuera de serverless", () => {
    expect(resolveClientOptions({}).max).toBe(5);
  });

  it("deja que el entorno fije el tamaño del pool", () => {
    expect(resolveClientOptions({ VERCEL: "1", DATABASE_POOL_MAX: "3" }).max).toBe(3);
  });

  it("ignora un tamaño de pool sin sentido y vuelve al defecto", () => {
    expect(resolveClientOptions({ DATABASE_POOL_MAX: "0" }).max).toBe(5);
    expect(resolveClientOptions({ DATABASE_POOL_MAX: "-2" }).max).toBe(5);
    expect(resolveClientOptions({ DATABASE_POOL_MAX: "muchas" }).max).toBe(5);
  });
});
