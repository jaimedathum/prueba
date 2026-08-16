import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Los cargadores, contra una base de datos de verdad.
 *
 * Son ~1.600 líneas que no tenían ni una prueba, y no es una zona cualquiera:
 * es el pegamento entre la base de datos, los motores y la pantalla. Los
 * motores puros están cubiertos de sobra; lo que fallaba —dos veces ya— era
 * este trozo: un `where` que no filtraba por liga, y un mercado que devolvía
 * todo lo que hubiera pasado alguna vez por él.
 *
 * Necesita Postgres y se salta sola sin él:
 *
 *   TEST_DATABASE_URL=postgresql://... npx vitest run lib/engine/loaders.test.ts
 */

const CONNECTION = process.env.TEST_DATABASE_URL;

describe.skipIf(!CONNECTION)("cargadores", () => {
  let client: import("postgres").Sql;
  let db: ReturnType<typeof import("drizzle-orm/postgres-js").drizzle>;
  let schema: typeof import("@/lib/db/schema");
  let queries: typeof import("@/lib/queries");
  let marketLoad: typeof import("./market-load");
  let lineupLoad: typeof import("./lineup-load");

  const CTX = {
    accountId: "cuenta",
    leagueId: "liga",
    myTeamId: "yo",
    competitionId: "1",
    initialBudget: 200_000_000,
    clauseMultiplier: 2,
  };

  let disposable: Awaited<
    ReturnType<typeof import("@/lib/test-db").createTestDatabase>
  >;

  beforeAll(async () => {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const { createTestDatabase } = await import("@/lib/test-db");
    schema = await import("@/lib/db/schema");

    // Base propia, por lo mismo que en `lib/tenant.test.ts`.
    disposable = await createTestDatabase("loaders");
    process.env.DATABASE_URL = disposable.url;

    client = postgres(disposable.url, { max: 1, prepare: false });
    db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });

    queries = await import("@/lib/queries");
    marketLoad = await import("./market-load");
    lineupLoad = await import("./lineup-load");

    await db.insert(schema.accounts).values({ id: "cuenta" });
    await db
      .insert(schema.accountLeagues)
      .values({ accountId: "cuenta", leagueId: "liga", myTeamId: "yo" });

    await db.insert(schema.realTeams).values({ id: "rt", name: "Equipo real" });
    await db.insert(schema.players).values([
      { id: "mio", name: "Mío", positionId: 3, realTeamId: "rt", marketValue: 5_000_000 },
      { id: "rival", name: "Del rival", positionId: 3, realTeamId: "rt", marketValue: 4_000_000 },
      { id: "vivo", name: "En venta", positionId: 4, realTeamId: "rt", marketValue: 3_000_000 },
      { id: "vendido", name: "Ya vendido", positionId: 4, realTeamId: "rt", marketValue: 9_000_000 },
      { id: "caducado", name: "Oferta caducada", positionId: 4, realTeamId: "rt", marketValue: 8_000_000 },
    ]);

    await db.insert(schema.managers).values([
      { id: "yo", leagueId: "liga", teamName: "El mío", reportedBalance: 10_000_000 },
      { id: "otro", leagueId: "liga", teamName: "El rival" },
      // Un manager de OTRA liga, para que se note si algún filtro falta.
      { id: "ajeno", leagueId: "otra-liga", teamName: "De otra liga" },
    ]);

    await db.insert(schema.rosterEntries).values([
      { leagueId: "liga", managerId: "yo", playerId: "mio", buyoutClause: 7_000_000 },
      { leagueId: "liga", managerId: "otro", playerId: "rival", buyoutClause: 6_000_000 },
      { leagueId: "otra-liga", managerId: "ajeno", playerId: "vendido", buyoutClause: 1 },
    ]);
  });

  afterAll(async () => {
    await client?.end();
    await disposable?.close();
  });

  describe("getDashboardData", () => {
    it("enseña solo mi plantilla, no la de la liga entera", async () => {
      const data = await queries.getDashboardData(CTX);

      expect(data.me?.teamName).toBe("El mío");
      expect(data.squad.map((row) => row.playerId)).toEqual(["mio"]);
    });

    it("calcula el ratio de cláusula sobre el valor", async () => {
      const data = await queries.getDashboardData(CTX);
      // 7M de cláusula sobre 5M de valor.
      expect(data.squad[0]!.clauseRatio).toBeCloseTo(1.4, 5);
    });
  });

  describe("getLineupDashboard", () => {
    /** El filtro por liga faltaba entero en este cargador. */
    it("no se lleva jugadores de otra liga", async () => {
      const data = await lineupLoad.getLineupDashboard(CTX);
      const ids = data?.candidates.map((c) => c.playerId) ?? [];

      expect(ids).toContain("mio");
      expect(ids).not.toContain("vendido");
    });
  });

  describe("getMarketDashboard", () => {
    beforeAll(async () => {
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.insert(schema.marketListings).values([
        // En venta ahora mismo.
        { id: "l-vivo", leagueId: "liga", playerId: "vivo", marketValue: 3_000_000, expiresAt: manana },
        // Ya no está: la sincronización lo vio desaparecer.
        { id: "l-vendido", leagueId: "liga", playerId: "vendido", marketValue: 9_000_000, removedAt: ayer },
        // Sigue registrado pero su plazo venció.
        { id: "l-caducado", leagueId: "liga", playerId: "caducado", marketValue: 8_000_000, expiresAt: ayer },
      ]);
    });

    /**
     * El bug que motivó todo esto: sin filtrar, el panel trataba como
     * comprable a cualquiera que hubiera pasado por el mercado, y esas ofertas
     * fantasma contaminaban el precio sombra del dinero — y con él las pujas y
     * la especulación de TODOS los candidatos, no solo de las fantasma.
     */
    it("ignora lo retirado y lo caducado", async () => {
      const data = await marketLoad.getMarketDashboard(CTX);
      const ids = data?.candidates.map((c) => c.playerId) ?? [];

      expect(ids).toContain("vivo");
      expect(ids).not.toContain("vendido");
      expect(ids).not.toContain("caducado");
    });

    it("respeta el instante en que se mira", async () => {
      // Colocándose ANTES de que caducara, la oferta vuelve a contar.
      const antes = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const data = await marketLoad.getMarketDashboard(CTX, antes);
      const ids = data?.candidates.map((c) => c.playerId) ?? [];

      expect(ids).toContain("caducado");
      // Lo retirado sigue fuera: es un hecho observado, no depende de la hora.
      expect(ids).not.toContain("vendido");
    });
  });
});
