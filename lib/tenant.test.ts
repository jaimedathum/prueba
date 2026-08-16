import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Prueba de aislamiento entre cuentas.
 *
 * Es la única de todo el proyecto que necesita una base de datos de verdad, y
 * por eso se salta sola cuando no hay una: el resto de la suite tiene que
 * seguir corriendo en cualquier sitio sin montar nada.
 *
 * Se salta con Postgres levantado y `TEST_DATABASE_URL` apuntando a una base
 * **desechable** — borra y recrea el esquema entero:
 *
 *   TEST_DATABASE_URL=postgresql://... npx vitest run lib/tenant.test.ts
 *
 * Lo que comprueba es justo lo que la fase 1a promete y no se puede verificar
 * leyendo el código: que dos cuentas en la **misma liga** conserven cada una
 * su equipo, y que una corrección manual de una no se le aplique a la otra.
 * Las dos cosas fallaban antes por construcción, no por descuido: `is_me` era
 * un booleano global y los overrides compartían espacio de claves.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;

describe.skipIf(!CONNECTION)("aislamiento entre cuentas", () => {
  let db: Awaited<ReturnType<typeof setup>>["db"];
  let client: Awaited<ReturnType<typeof setup>>["client"];
  let schema: Awaited<ReturnType<typeof setup>>["schema"];
  let overrides: typeof import("./overrides");
  let tenant: typeof import("./tenant");

  async function setup() {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const { createTestDatabase } = await import("./test-db");
    const schema = await import("./db/schema");

    // Base propia: vitest corre los ficheros en paralelo y compartirla con la
    // otra prueba de integración las haría fallar a ratos.
    disposable = await createTestDatabase("tenant");
    process.env.DATABASE_URL = disposable.url;

    const client = postgres(disposable.url, { max: 1, prepare: false });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    return { client, db, schema };
  }

  let disposable: Awaited<
    ReturnType<typeof import("./test-db").createTestDatabase>
  >;

  beforeAll(async () => {
    ({ client, db, schema } = await setup());
    overrides = await import("./overrides");
    tenant = await import("./tenant");

    // Dos cuentas, UNA liga compartida, equipos distintos: el caso que antes
    // era imposible de representar.
    await db.insert(schema.accounts).values([{ id: "cuenta-a" }, { id: "cuenta-b" }]);
    await db.insert(schema.realTeams).values({ id: "rt1", name: "Equipo real" });
    await db.insert(schema.players).values({
      id: "p1",
      name: "Jugador",
      positionId: 3,
      realTeamId: "rt1",
      marketValue: 5_000_000,
    });
    await db.insert(schema.managers).values([
      { id: "equipo-a", leagueId: "liga-compartida", teamName: "Los de A" },
      { id: "equipo-b", leagueId: "liga-compartida", teamName: "Los de B" },
    ]);
    await db.insert(schema.accountLeagues).values([
      { accountId: "cuenta-a", leagueId: "liga-compartida", myTeamId: "equipo-a" },
      { accountId: "cuenta-b", leagueId: "liga-compartida", myTeamId: "equipo-b" },
    ]);
  });

  afterAll(async () => {
    await client?.end();
    await disposable?.close();
  });

  it("cada cuenta conserva su equipo en la misma liga", async () => {
    const a = await tenant.resolveTenant("cuenta-a");
    const b = await tenant.resolveTenant("cuenta-b");

    expect(a.myTeamId).toBe("equipo-a");
    expect(b.myTeamId).toBe("equipo-b");
    expect(a.leagueId).toBe(b.leagueId);
  });

  it("aplica los valores por defecto del juego cuando la liga no los cambia", async () => {
    const a = await tenant.resolveTenant("cuenta-a");
    expect(a.clauseMultiplier).toBe(2);
    expect(a.initialBudget).toBe(200_000_000);
  });

  it("una corrección manual no se le aplica a la otra cuenta", async () => {
    await overrides.setOverride({
      accountId: "cuenta-a",
      entity: "player",
      entityId: "p1",
      field: "marketValue",
      value: 9_999_999,
      reason: "prueba de aislamiento",
    });

    const deA = await overrides.loadOverrides("cuenta-a", "player");
    const deB = await overrides.loadOverrides("cuenta-b", "player");

    expect(deA.get("p1")).toEqual({ marketValue: 9_999_999 });
    expect(deB.size).toBe(0);
  });

  it("borrar la corrección de una no toca la de la otra", async () => {
    await overrides.setOverride({
      accountId: "cuenta-b",
      entity: "player",
      entityId: "p1",
      field: "marketValue",
      value: 1,
    });
    await overrides.clearOverride("cuenta-b", "player", "p1", "marketValue");

    expect((await overrides.loadOverrides("cuenta-a", "player")).size).toBe(1);
    expect((await overrides.loadOverrides("cuenta-b", "player")).size).toBe(0);
  });

  it("explica qué falta cuando la cuenta no tiene liga", async () => {
    await db.insert(schema.accounts).values({ id: "cuenta-sin-liga" });
    await expect(tenant.resolveTenant("cuenta-sin-liga")).rejects.toThrow(
      /ninguna liga configurada/i,
    );
  });

  it("explica qué falta cuando la liga no tiene equipo identificado", async () => {
    await db.insert(schema.accounts).values({ id: "cuenta-sin-equipo" });
    await db.insert(schema.accountLeagues).values({
      accountId: "cuenta-sin-equipo",
      leagueId: "liga-compartida",
      myTeamId: null,
    });

    await expect(tenant.resolveTenant("cuenta-sin-equipo")).rejects.toThrow(
      /no se sabe cuál es tu equipo/i,
    );
  });
});
