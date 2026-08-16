import { and, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { DEFAULT_ACCOUNT_ID } from "@/lib/tenant";
import {
  accountLeagues,
  activityEvents,
  managerSnapshots,
  managers,
  marketListings,
  matches,
  playerMatchStats,
  playerLeagueSnapshots,
  players,
  realTeams,
  rosterEntries,
  rosterSnapshots,
  syncRuns,
} from "@/lib/db/schema";
import { initialBudget } from "@/lib/engine/rules";
import { FantasySession } from "@/lib/fantasy/auth";
import { FantasyClient } from "@/lib/fantasy/client";
import { endpoints } from "@/lib/fantasy/endpoints";
import { ShapeCollector } from "./mapper";
import {
  parseActivityEvent,
  parseManager,
  parseMarketListing,
  parseMatch,
  parsePlayer,
  parsePlayerMatchStat,
  parseRealTeam,
  parseTeamBalance,
  parseRosterEntry,
  type ParsedPlayer,
} from "./parse";
import { RawRecorder } from "./raw";
import { syncGlobal } from "./sync-global";
import { asArray, chunk, today } from "./util";

/**
 * Sincronización diaria.
 *
 * Es idempotente por diseño: ejecutarla dos veces seguidas no duplica eventos
 * ni pisa correcciones manuales. Y escribe snapshots antes que nada más,
 * porque el histórico de mercado es lo único que no se puede recuperar hacia
 * atrás si un día falla.
 */

export interface SyncOptions {
  client?: FantasyClient;
  /** De quién es la credencial y a quién se le anota la liga. */
  accountId?: string;
  leagueId?: string;
  /** false = lee de la API pero no escribe en la base de datos (`--dry-run`). */
  persist?: boolean;
  /** Recoge el informe de mapeo para cerrar los parsers con datos reales. */
  collectShape?: boolean;
  maxActivityPages?: number;
  log?: (message: string) => void;
  /**
   * Saltarse la mitad global.
   *
   * Es lo que permite que el trabajo caro se pague una vez: quien sincroniza
   * varias ligas seguidas ejecuta `syncGlobal()` al principio y luego cada
   * liga con esto activado. Sin ello, el catálogo y las 38 jornadas de
   * calendario se pedirían una vez por liga.
   */
  skipGlobal?: boolean;
}

export interface SyncResult {
  leagueId: string | null;
  stats: Record<string, number>;
  warnings: string[];
  shape: ShapeCollector | null;
}

/**
 * Nombre de manager en la respuesta de `/v4/user/me`.
 *
 * Confirmado contra la API real: `/v4/user/me` devuelve el usuario pelado
 * —`id`, `managerName`, `locale`, `region`— y **ningún equipo ni liga**. Así
 * que el id que trae es el del usuario, no el del equipo, y no sirve para
 * identificar la plantilla. El nombre sí, cruzándolo con la clasificación.
 */
export function extractManagerName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  for (const key of ["managerName", "name", "nickname", "userName"]) {
    const value = root[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * Cruza el nombre de `/v4/user/me` con los managers de la clasificación.
 *
 * Solo resuelve si la coincidencia es **única**: con dos managers llamados
 * igual, elegir uno sería jugársela a cara o cruz, y equivocarse aquí es
 * silencioso —la app enseñaría la plantilla de otro como si fuera tuya—, que
 * es justo el error que este proyecto no se permite.
 */
export function matchMyTeamByName(
  managerName: string | null,
  managers: Array<{ id: string; managerName: string | null }>,
): string | null {
  if (!managerName) return null;
  const target = managerName.trim().toLowerCase();

  const matches = managers.filter(
    (manager) => manager.managerName?.trim().toLowerCase() === target,
  );
  return matches.length === 1 ? matches[0]!.id : null;
}

/**
 * Busca el id de mi equipo en la respuesta de `/v4/user/me`. La forma exacta
 * está sin confirmar, así que se prueban varias rutas plausibles y, si ninguna
 * encaja, se devuelve null y la sincronización avisa en vez de adivinar.
 */
export function extractMyTeamId(
  payload: unknown,
  leagueId: string,
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const teams = [root.teams, root.leagues, (root.data as Record<string, unknown>)?.teams]
    .filter(Array.isArray)
    .flat() as Array<Record<string, unknown>>;

  for (const team of teams) {
    const league = team.league as Record<string, unknown> | undefined;
    const candidateLeague = league?.id ?? team.leagueId;
    if (String(candidateLeague) === leagueId) {
      const id = team.id ?? team.teamId ?? (team.team as Record<string, unknown>)?.id;
      if (typeof id === "string" || typeof id === "number") return String(id);
    }
  }

  return null;
}

export async function runSync(options: SyncOptions = {}): Promise<SyncResult> {
  const accountId = options.accountId ?? DEFAULT_ACCOUNT_ID;
  const persist = options.persist ?? true;
  const log = options.log ?? (() => {});
  const shape = options.collectShape ? new ShapeCollector() : null;
  const warnings: string[] = [];
  const stats: Record<string, number> = {};

  const recorder = persist ? new RawRecorder() : null;
  const client =
    options.client ??
    new FantasyClient({
      session: new FantasySession(accountId),
      onResponse: recorder ? (record) => recorder.record(record) : undefined,
    });

  const db = persist ? getDb() : null;
  let runId: number | null = null;

  if (db) {
    // Antes de abrir una fila nueva, cerrar las que quedaron colgadas: si no,
    // se acumulan y el panel enseña "En curso" indefinidamente.
    await reconcileStaleRuns();

    const [run] = await db
      .insert(syncRuns)
      .values({ status: "running" })
      .returning({ id: syncRuns.id });
    runId = run?.id ?? null;
  }

  try {
    /* --- 1. Liga --------------------------------------------------- */
    /**
     * De dónde sale la liga, por orden: lo que pida quien llama, lo que ya
     * tenga anotado la cuenta, la variable de entorno —que se conserva por
     * compatibilidad con el despliegue de un solo dueño— y, en último
     * término, la primera que devuelva la API.
     *
     * Lo que cambia respecto a antes es que la base de datos manda sobre el
     * entorno: la liga es una propiedad de la cuenta, no del proceso.
     */
    const [storedLeague] = db
      ? await db
          .select({ leagueId: accountLeagues.leagueId })
          .from(accountLeagues)
          .where(
            and(
              eq(accountLeagues.accountId, accountId),
              eq(accountLeagues.active, true),
            ),
          )
          .orderBy(accountLeagues.createdAt)
          .limit(1)
      : [];

    let leagueId =
      options.leagueId ??
      storedLeague?.leagueId ??
      process.env.FANTASY_LEAGUE_ID ??
      null;

    const leaguesPayload = await client.get(endpoints.leagues());
    const leagues = asArray(leaguesPayload);
    stats.leagues = leagues.length;

    if (!leagueId) {
      const first = leagues[0] as Record<string, unknown> | undefined;
      leagueId = (first?.id as string | undefined) ?? null;
      if (leagueId) {
        warnings.push(
          `FANTASY_LEAGUE_ID no está configurado; usando la primera liga (${leagueId}).`,
        );
      }
    }

    if (!leagueId) {
      throw new Error(
        "No se ha podido determinar la liga. Configura FANTASY_LEAGUE_ID.",
      );
    }
    log(`Liga: ${leagueId}`);

    // La fila de `sync_runs` se abre antes de saber la liga, así que se anota
    // ahora: es lo que permite que el panel de una liga enseñe el estado de su
    // sincronización y no el de otra.
    if (db && runId !== null) {
      await db
        .update(syncRuns)
        .set({ leagueId })
        .where(eq(syncRuns.id, runId));
    }

    /* --- 2. Lo que es igual para todo el mundo --------------------- */
    /**
     * Catálogo, calendario, estadísticas y onces probables salen de aquí, y
     * son la mayor parte de las peticiones. Al estar fuera de la mitad por
     * liga, se pagan **una vez** por mucha gente que entre.
     */
    let parsedPlayers: ParsedPlayer[];
    if (options.skipGlobal) {
      // Ya lo hizo otro en esta tanda: basta con el catálogo que hay guardado.
      parsedPlayers = db
        ? ((await db.select().from(players)) as ParsedPlayer[])
        : [];
    } else {
      const global = await syncGlobal({ client, persist, log, shape });
      parsedPlayers = global.players;
      Object.assign(stats, global.stats);
      warnings.push(...global.warnings);
    }

    /* --- 3. Managers de la liga ------------------------------------ */
    const standingPayload = await client.get(endpoints.standing(leagueId));
    const parsedManagers = [];
    for (const raw of asArray(standingPayload)) {
      const { manager, mapper } = parseManager(raw, leagueId);
      shape?.add("manager", mapper);
      if (manager) parsedManagers.push(manager);
    }
    stats.managers = parsedManagers.length;
    log(`Managers: ${parsedManagers.length}`);

    if (db && parsedManagers.length > 0) {
      await db
        .insert(managers)
        .values(parsedManagers)
        .onConflictDoUpdate({
          target: managers.id,
          set: {
            teamName: sql`excluded.team_name`,
            managerName: sql`excluded.manager_name`,
            reportedBalance: sql`excluded.reported_balance`,
            teamValue: sql`excluded.team_value`,
            points: sql`excluded.points`,
            position: sql`excluded.position`,
            updatedAt: new Date(),
          },
        });
    }

    /* --- 3b. Cuál de los equipos es el mío -------------------------- */
    // Sin esto la interfaz no sabe qué plantilla enseñar, y el motor de caja
    // no tiene contra qué calibrarse (el saldo propio es el único visible).
    const mePayload = await client.get(endpoints.me());
    const myTeamId =
      process.env.FANTASY_TEAM_ID ??
      extractMyTeamId(mePayload, leagueId) ??
      // `/v4/user/me` no trae equipos, así que la vía que de verdad funciona
      // es cruzar el nombre de manager con la clasificación.
      matchMyTeamByName(extractManagerName(mePayload), parsedManagers) ??
      // `/leagues` solo devuelve TUS ligas, así que en una con un único equipo
      // ese equipo es necesariamente el tuyo. No es una heurística: es una
      // deducción, y desatasca las ligas recién creadas para probar.
      (parsedManagers.length === 1 ? parsedManagers[0]!.id : null);

    if (db && myTeamId && parsedManagers.some((m) => m.id === myTeamId)) {
      /**
       * La identidad se anota en `account_leagues`, no en `managers`.
       *
       * Aquí vivía `UPDATE managers SET is_me = false` **sin `WHERE`**, seguido
       * de marcar el equipo bueno. Con una sola cuenta funcionaba; con dos, la
       * sincronización de una le borraba la identidad a la otra. Ahora la marca
       * es de la cuenta y no puede pisar a nadie.
       */
      await db
        .insert(accountLeagues)
        .values({ accountId, leagueId, myTeamId })
        .onConflictDoUpdate({
          target: [accountLeagues.accountId, accountLeagues.leagueId],
          set: { myTeamId, active: true },
        });
      stats.myTeamIdentified = 1;
    } else {
      stats.myTeamIdentified = 0;
      const nombre = extractManagerName(mePayload);
      warnings.push(
        "No se ha identificado tu equipo dentro de la liga, así que no se " +
          "puede enseñar tu plantilla ni calibrar el motor de caja contra tu " +
          "saldo. Configura FANTASY_TEAM_ID con el id de tu equipo." +
          (nombre
            ? ` Se ha buscado por tu nombre de manager ("${nombre}") sin ` +
              "encontrar una coincidencia única en la clasificación."
            : ""),
      );
    }

    /* --- 4. Plantillas y cláusulas --------------------------------- */
    const rosterRows: Array<{
      leagueId: string;
      managerId: string;
      playerId: string;
      buyoutClause: number | null;
      clauseLockedUntil: Date | null;
      acquiredAt: Date | null;
      acquisitionPrice: number | null;
    }> = [];

    const balances = new Map<string, number>();

    for (const manager of parsedManagers) {
      const teamPayload = await client.get(
        endpoints.team(leagueId, manager.id),
      );

      // El saldo vive aquí, no en la clasificación. Sin él la calibración no
      // tiene contra qué corregir y la caja propia se queda en el presupuesto
      // inicial supuesto.
      const balance = parseTeamBalance(teamPayload);
      if (balance !== null) {
        balances.set(manager.id, balance);
        manager.reportedBalance = balance;
      }

      const roster =
        asArray((teamPayload as Record<string, unknown>)?.["players"]).length > 0
          ? asArray((teamPayload as Record<string, unknown>)["players"])
          : asArray(teamPayload);

      for (const raw of roster) {
        const { entry, mapper } = parseRosterEntry(raw);
        shape?.add("rosterEntry", mapper);
        if (!entry) continue;
        rosterRows.push({
          leagueId,
          managerId: manager.id,
          playerId: entry.playerId,
          buyoutClause: entry.buyoutClause,
          clauseLockedUntil: entry.clauseLockedUntil,
          acquiredAt: entry.acquiredAt,
          acquisitionPrice: entry.acquisitionPrice,
        });
      }
    }
    stats.rosterEntries = rosterRows.length;
    stats.balancesKnown = balances.size;
    log(`Jugadores en plantillas: ${rosterRows.length}`);

    if (db && balances.size > 0) {
      for (const [managerId, balance] of balances) {
        await db
          .update(managers)
          .set({ reportedBalance: balance, updatedAt: new Date() })
          .where(eq(managers.id, managerId));
      }
    }

    if (myTeamId && !balances.has(myTeamId)) {
      warnings.push(
        "No se ha encontrado tu saldo, así que la caja no se puede calibrar " +
          "y todas las bandas arrastran el presupuesto inicial supuesto " +
          `(${(initialBudget() / 1_000_000).toFixed(0)}M). Si tu liga empieza ` +
          "con otro, configúralo en FANTASY_INITIAL_BUDGET, y revisa los " +
          "alias de parseTeamBalance con --shape.",
      );
    }

    if (db && rosterRows.length > 0) {
      // Solo se guardan las entradas de jugadores que ya existen en la tabla
      // players: si el mapeo de un jugador falló, no se inventa la fila.
      const knownIds = new Set(parsedPlayers.map((p) => p.id));
      const valid = rosterRows.filter((row) => knownIds.has(row.playerId));
      if (valid.length !== rosterRows.length) {
        warnings.push(
          `${rosterRows.length - valid.length} entradas de plantilla apuntan a jugadores no reconocidos.`,
        );
      }

      for (const batch of chunk(valid)) {
        await db
          .insert(rosterEntries)
          .values(batch)
          .onConflictDoUpdate({
            target: [rosterEntries.leagueId, rosterEntries.playerId],
            set: {
              managerId: sql`excluded.manager_id`,
              buyoutClause: sql`excluded.buyout_clause`,
              clauseLockedUntil: sql`excluded.clause_locked_until`,
              acquiredAt: sql`excluded.acquired_at`,
              acquisitionPrice: sql`excluded.acquisition_price`,
              updatedAt: new Date(),
            },
          });
      }

      // Un jugador que ya no está en ninguna plantilla vuelve a ser libre.
      const ownedIds = valid.map((row) => row.playerId);
      if (ownedIds.length > 0) {
        await db
          .delete(rosterEntries)
          .where(
            and(
              eq(rosterEntries.leagueId, leagueId),
              notInArray(rosterEntries.playerId, ownedIds),
            ),
          );
      }
    }

    /* --- 5. Mercado ------------------------------------------------ */
    const marketPayload = await client.get(endpoints.market(leagueId));
    const listings = [];
    for (const raw of asArray(marketPayload)) {
      const { listing, mapper } = parseMarketListing(raw);
      shape?.add("marketListing", mapper);
      if (listing) listings.push({ ...listing, leagueId });
    }
    stats.marketListings = listings.length;
    log(`Mercado: ${listings.length} jugadores`);

    if (db && listings.length > 0) {
      const knownIds = new Set(parsedPlayers.map((p) => p.id));
      const valid = listings.filter((l) => knownIds.has(l.playerId));
      for (const batch of chunk(valid)) {
        await db
          .insert(marketListings)
          .values(batch)
          .onConflictDoUpdate({
            target: marketListings.id,
            set: {
              marketValue: sql`excluded.market_value`,
              askingPrice: sql`excluded.asking_price`,
              expiresAt: sql`excluded.expires_at`,
              lastSeenAt: new Date(),
              // Si un marketId vuelve a aparecer, vuelve a estar en venta.
              removedAt: null,
            },
          });
      }

      /**
       * Y lo que ya no está, se cierra.
       *
       * Esta es la mitad que faltaba: sin ella la tabla solo crecía y el panel
       * de mercado acababa recomendando pujas por jugadores vendidos hacía
       * meses. El equivalente para plantillas ya existía unas líneas más
       * arriba (el `notInArray` de `roster_entries`); el mercado se había
       * quedado sin él.
       *
       * Se marca `removedAt` en vez de borrar: cuánto tarda en venderse un
       * jugador no se puede reconstruir después.
       */
      const currentIds = listings.map((l) => l.id);
      const closed = await db
        .update(marketListings)
        .set({ removedAt: new Date() })
        .where(
          and(
            eq(marketListings.leagueId, leagueId),
            isNull(marketListings.removedAt),
            notInArray(marketListings.id, currentIds),
          ),
        )
        .returning({ id: marketListings.id });

      stats.marketListingsClosed = closed.length;
      if (closed.length > 0) log(`Mercado: ${closed.length} ya no están`);
    } else if (db && listings.length === 0) {
      /**
       * Cero jugadores se trata como caída, no como "hoy no hay mercado".
       *
       * Es la misma doctrina que con las fuentes de onces: una respuesta 200
       * con la lista vacía casi siempre significa que el parser dejó de
       * encontrar los campos, no que el mercado esté desierto. Cerrar todo a
       * ciegas con esa señal vaciaría el panel entero por un cambio de la API.
       */
      warnings.push(
        "El mercado ha devuelto cero jugadores. No se ha cerrado ninguna " +
          "oferta por si acaso: un mercado vacío casi siempre es un parser " +
          "roto, no un mercado sin nadie. Si se repite, revisa " +
          "parseMarketListing con `npm run sync -- --dry-run --shape`.",
      );
    }

    /* --- 6. Feed de actividad -------------------------------------- */
    const maxPages = options.maxActivityPages ?? 200;
    const events = [];
    const managerIds = new Set(parsedManagers.map((m) => m.id));
    const playerIds = new Set(parsedPlayers.map((p) => p.id));

    for (let page = 0; page < maxPages; page++) {
      const payload = await client.get(endpoints.activity(leagueId, page));
      const items = asArray(payload);
      if (items.length === 0) break;

      for (const raw of items) {
        const { event, mapper } = parseActivityEvent(raw, leagueId);
        shape?.add("activityEvent", mapper);
        if (!event) continue;
        events.push({
          ...event,
          // Las claves foráneas solo se rellenan si la entidad existe:
          // un id desconocido no debe tumbar la ingesta entera.
          managerId: managerIds.has(event.managerId ?? "")
            ? event.managerId
            : null,
          counterpartyManagerId: managerIds.has(
            event.counterpartyManagerId ?? "",
          )
            ? event.counterpartyManagerId
            : null,
          playerId: playerIds.has(event.playerId ?? "") ? event.playerId : null,
          raw: raw as object,
        });
      }
    }
    stats.activityEvents = events.length;
    stats.activityUnknown = events.filter((e) => e.type === "unknown").length;
    log(
      `Feed de actividad: ${events.length} eventos (${stats.activityUnknown} sin clasificar)`,
    );

    if (stats.activityUnknown > 0) {
      warnings.push(
        `${stats.activityUnknown} eventos del feed sin clasificar: la banda de caja saldrá más ancha. ` +
          "Revisa TYPE_PATTERNS en lib/ingest/parse.ts con los datos reales.",
      );
    }

    if (db && events.length > 0) {
      for (const batch of chunk(events)) {
        await db
          .insert(activityEvents)
          .values(batch)
          .onConflictDoUpdate({
            target: activityEvents.id,
            // Se reprocesa la clasificación: si mejora el parser, mejora el
            // histórico sin tener que borrar nada.
            set: {
              type: sql`excluded.type`,
              amount: sql`excluded.amount`,
              amountCertain: sql`excluded.amount_certain`,
              managerId: sql`excluded.manager_id`,
              counterpartyManagerId: sql`excluded.counterparty_manager_id`,
              playerId: sql`excluded.player_id`,
            },
          });
      }
    }

    /* --- 7. Snapshots del día -------------------------------------- */
    if (db) {
      const capturedOn = today();
      const ownership = new Map<string, number>();
      for (const row of rosterRows) {
        ownership.set(row.playerId, (ownership.get(row.playerId) ?? 0) + 1);
      }
      const onMarket = new Set(listings.map((l) => l.playerId));

      /**
       * La propiedad y la presencia en el mercado son **por liga**: `value.ts`
       * calcula `ownedCount / leagueSize`. Vivían en `player_value_snapshots`,
       * que tiene clave global, así que con dos ligas la última en sincronizar
       * habría pisado la de todas — y el modelo de precios habría aprendido de
       * datos de otro sitio sin que nada lo delatara.
       */
      const leagueRows = parsedPlayers
        .filter((p) => p.marketValue !== null)
        .map((p) => ({
          capturedOn,
          leagueId,
          playerId: p.id,
          ownedCount: ownership.get(p.id) ?? 0,
          onMarket: onMarket.has(p.id),
        }));

      for (const batch of chunk(leagueRows)) {
        await db
          .insert(playerLeagueSnapshots)
          .values(batch)
          .onConflictDoUpdate({
            target: [
              playerLeagueSnapshots.capturedOn,
              playerLeagueSnapshots.leagueId,
              playerLeagueSnapshots.playerId,
            ],
            set: {
              ownedCount: sql`excluded.owned_count`,
              onMarket: sql`excluded.on_market`,
            },
          });
      }
      stats.leagueSnapshots = leagueRows.length;

      const valueByPlayer = new Map(
        parsedPlayers.map((p) => [p.id, p.marketValue]),
      );
      const rosterSnapshotRows = rosterRows.map((row) => ({
        capturedOn,
        leagueId: row.leagueId,
        managerId: row.managerId,
        playerId: row.playerId,
        buyoutClause: row.buyoutClause,
        marketValue: valueByPlayer.get(row.playerId) ?? null,
      }));

      for (const batch of chunk(rosterSnapshotRows)) {
        await db
          .insert(rosterSnapshots)
          .values(batch)
          .onConflictDoUpdate({
            target: [
              rosterSnapshots.capturedOn,
              rosterSnapshots.leagueId,
              rosterSnapshots.playerId,
            ],
            set: {
              managerId: sql`excluded.manager_id`,
              buyoutClause: sql`excluded.buyout_clause`,
              marketValue: sql`excluded.market_value`,
            },
          });
      }
      stats.rosterSnapshots = rosterSnapshotRows.length;

      const managerSnapshotRows = parsedManagers.map((m) => ({
        capturedOn,
        leagueId,
        managerId: m.id,
        reportedBalance: m.reportedBalance,
        teamValue: m.teamValue,
        points: m.points,
        position: m.position,
      }));

      if (managerSnapshotRows.length > 0) {
        await db
          .insert(managerSnapshots)
          .values(managerSnapshotRows)
          .onConflictDoUpdate({
            target: [
              managerSnapshots.capturedOn,
              managerSnapshots.leagueId,
              managerSnapshots.managerId,
            ],
            set: {
              reportedBalance: sql`excluded.reported_balance`,
              teamValue: sql`excluded.team_value`,
              points: sql`excluded.points`,
              position: sql`excluded.position`,
            },
          });
      }
      stats.managerSnapshots = managerSnapshotRows.length;
    }

    if (recorder) {
      stats.rawStored = recorder.stats.stored;
      stats.rawSkipped = recorder.stats.skippedUnchanged;
    }

    if (db && runId !== null) {
      await db
        .update(syncRuns)
        .set({ status: "ok", finishedAt: new Date(), stats })
        .where(eq(syncRuns.id, runId));
    }

    return { leagueId, stats, warnings, shape };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (db && runId !== null) {
      await db
        .update(syncRuns)
        .set({ status: "failed", finishedAt: new Date(), error: message, stats })
        .where(eq(syncRuns.id, runId));
    }
    throw error;
  }
}

/**
 * Cuánto puede durar una sincronización antes de darla por muerta.
 *
 * `maxDuration` son 300 s, así que a los 15 minutos no queda ninguna duda: o
 * la plataforma cortó la función, o el proceso se cayó. En ninguno de los dos
 * casos hay nadie que vaya a cerrar esa fila.
 */
const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * Cierra las sincronizaciones que se quedaron colgadas en "running".
 *
 * Cuando la plataforma corta la función a mitad, el `catch`/`finally` de
 * `runSync` no llega a ejecutarse y la fila se queda en "running" **para
 * siempre**. Eso no es solo cosmético: el aviso de fallo de sincronización se
 * dispara mirando `status === "failed"` (`lib/alerts/digest.ts`), así que
 * justo el caso más grave —llevar días sin datos frescos— era el único que no
 * avisaba nunca.
 *
 * Se llama al arrancar una sincronización nueva y también antes de componer
 * los avisos, que es donde el silencio hace daño.
 */
export async function reconcileStaleRuns(now = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - STALE_RUN_MS);

  const closed = await db
    .update(syncRuns)
    .set({
      status: "failed",
      finishedAt: now,
      error:
        "Interrumpida: la ejecución no llegó a terminar (probablemente un " +
        "timeout de la plataforma) y se ha cerrado al detectarla colgada.",
    })
    .where(and(eq(syncRuns.status, "running"), lt(syncRuns.startedAt, cutoff)))
    .returning({ id: syncRuns.id });

  return closed.length;
}

/**
 * Última sincronización de una liga, para el panel de estado.
 *
 * Sin filtrar por liga, el panel de un cliente enseñaría el estado de la
 * sincronización de otro — y en particular daría por buena la suya cuando la
 * que falló era la propia.
 */
export async function lastSyncRun(leagueId?: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(syncRuns)
    .where(leagueId ? eq(syncRuns.leagueId, leagueId) : undefined)
    .orderBy(sql`${syncRuns.startedAt} DESC`)
    .limit(1);
  return run ?? null;
}

export { inArray };
