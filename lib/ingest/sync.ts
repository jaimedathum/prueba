import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  activityEvents,
  managerSnapshots,
  managers,
  marketListings,
  matches,
  playerMatchStats,
  playerValueSnapshots,
  players,
  realTeams,
  rosterEntries,
  rosterSnapshots,
  syncRuns,
} from "@/lib/db/schema";
import { initialBudget } from "@/lib/engine/rules";
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
  type ParsedRealTeam,
} from "./parse";
import { RawRecorder } from "./raw";

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
  leagueId?: string;
  /** false = lee de la API pero no escribe en la base de datos (`--dry-run`). */
  persist?: boolean;
  /** Recoge el informe de mapeo para cerrar los parsers con datos reales. */
  collectShape?: boolean;
  maxActivityPages?: number;
  log?: (message: string) => void;
}

export interface SyncResult {
  leagueId: string | null;
  stats: Record<string, number>;
  warnings: string[];
  shape: ShapeCollector | null;
}

const today = () => new Date().toISOString().slice(0, 10);

function chunk<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
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

/** La API devuelve a veces `{data: [...]}` y a veces el array pelado. */
function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["data", "items", "elements", "results"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

export async function runSync(options: SyncOptions = {}): Promise<SyncResult> {
  const persist = options.persist ?? true;
  const log = options.log ?? (() => {});
  const shape = options.collectShape ? new ShapeCollector() : null;
  const warnings: string[] = [];
  const stats: Record<string, number> = {};

  const recorder = persist ? new RawRecorder() : null;
  const client =
    options.client ??
    new FantasyClient({
      onResponse: recorder ? (record) => recorder.record(record) : undefined,
    });

  const db = persist ? getDb() : null;
  let runId: number | null = null;

  if (db) {
    const [run] = await db
      .insert(syncRuns)
      .values({ status: "running" })
      .returning({ id: syncRuns.id });
    runId = run?.id ?? null;
  }

  try {
    /* --- 1. Liga --------------------------------------------------- */
    let leagueId = options.leagueId ?? process.env.FANTASY_LEAGUE_ID ?? null;

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

    /* --- 2. Jugadores ---------------------------------------------- */
    const playersPayload = await client.get(endpoints.players());
    const parsedPlayers = [];
    const teamsSeen = new Map<string, ParsedRealTeam>();

    for (const raw of asArray(playersPayload)) {
      const { player, mapper } = parsePlayer(raw);
      shape?.add("player", mapper);
      if (!player) continue;
      parsedPlayers.push(player);

      // Mismo parser, mismos alias: así el equipo al que apunta el jugador es
      // exactamente el que se guarda.
      const team = parseRealTeam(raw);
      if (team) teamsSeen.set(team.id, team);
    }
    stats.players = parsedPlayers.length;
    log(`Jugadores: ${parsedPlayers.length}`);

    if (db) {
      for (const batch of chunk([...teamsSeen.values()])) {
        await db
          .insert(realTeams)
          .values(batch)
          .onConflictDoUpdate({
            target: realTeams.id,
            set: {
              name: sql`excluded.name`,
              shortName: sql`excluded.short_name`,
              badgeUrl: sql`excluded.badge_url`,
            },
          });
      }

      // Un jugador no puede apuntar a un equipo que no existe: la clave ajena
      // aborta el INSERT entero y con él la sincronización. Igual que en el
      // feed de actividad, un id desconocido vacía el vínculo pero no tumba la
      // ingesta. Se comprueba contra la tabla, no contra lo visto en esta
      // pasada, porque puede haber equipos de sincronizaciones anteriores.
      const knownTeamIds = new Set(
        (await db.select({ id: realTeams.id }).from(realTeams)).map((t) => t.id),
      );

      let orphaned = 0;
      for (const player of parsedPlayers) {
        if (player.realTeamId !== null && !knownTeamIds.has(player.realTeamId)) {
          player.realTeamId = null;
          orphaned++;
        }
      }
      if (orphaned > 0) {
        stats.playersWithoutTeam = orphaned;
        warnings.push(
          `${orphaned} jugadores apuntan a un equipo que no se ha podido ` +
            "identificar; se guardan sin equipo. El modelo de equipos y el " +
            "ajuste por rival serán menos precisos para ellos. Revisa los " +
            "alias de TEAM_ID_ALIASES en lib/ingest/parse.ts con --shape.",
        );
      }

      for (const batch of chunk(parsedPlayers)) {
        await db
          .insert(players)
          .values(batch)
          .onConflictDoUpdate({
            target: players.id,
            set: {
              name: sql`excluded.name`,
              nickname: sql`excluded.nickname`,
              positionId: sql`excluded.position_id`,
              realTeamId: sql`excluded.real_team_id`,
              status: sql`excluded.status`,
              marketValue: sql`excluded.market_value`,
              totalPoints: sql`excluded.total_points`,
              averagePoints: sql`excluded.average_points`,
              updatedAt: new Date(),
            },
          });
      }
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
      // Sin filtrar por liga a propósito. Los paneles leen `isMe` con un
      // `limit 1`, así que una marca superviviente de una liga anterior —al
      // dejarla o al cambiarse— haría que la app siguiera enseñando aquel
      // equipo, con datos que ya nadie actualiza. Solo puede haber un "yo".
      await db.update(managers).set({ isMe: false });
      await db
        .update(managers)
        .set({ isMe: true })
        .where(eq(managers.id, myTeamId));
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
            },
          });
      }
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

    /* --- 6b. Calendario y estadísticas por jornada ------------------ */
    // Sin resultados reales no hay modelo de equipos, y sin él los puntos
    // esperados pierden el ajuste por rival y la portería a cero.
    const weekPayload = await client.get(endpoints.currentWeek());
    const currentWeek =
      (weekPayload as Record<string, unknown> | null)?.["weekNumber"] ??
      (weekPayload as Record<string, unknown> | null)?.["week"] ??
      null;
    const lastWeek =
      typeof currentWeek === "number"
        ? currentWeek
        : Number(currentWeek) || null;

    if (lastWeek === null) {
      warnings.push(
        "No se ha podido determinar la jornada actual: no se sincronizan " +
          "resultados ni estadísticas, y el modelo de equipos se queda sin datos.",
      );
    } else {
      const parsedMatches = [];
      for (let week = 1; week <= lastWeek; week++) {
        const payload = await client.get(endpoints.calendar(), {
          weekNumber: week,
        });
        for (const raw of asArray(payload)) {
          const { match, mapper } = parseMatch(raw, week);
          shape?.add("match", mapper);
          if (match) parsedMatches.push(match);
        }
      }
      stats.matches = parsedMatches.length;
      stats.matchesFinished = parsedMatches.filter((m) => m.finished).length;
      log(
        `Partidos: ${parsedMatches.length} (${stats.matchesFinished} con resultado)`,
      );

      if (db && parsedMatches.length > 0) {
        for (const batch of chunk(parsedMatches)) {
          await db
            .insert(matches)
            .values(batch)
            .onConflictDoUpdate({
              target: matches.id,
              set: {
                homeGoals: sql`excluded.home_goals`,
                awayGoals: sql`excluded.away_goals`,
                kickoffAt: sql`excluded.kickoff_at`,
                finished: sql`excluded.finished`,
              },
            });
        }
      }

      // Estadísticas solo de jornadas ya jugadas: las futuras no tienen nada.
      const playedWeeks = [
        ...new Set(parsedMatches.filter((m) => m.finished).map((m) => m.matchday)),
      ].sort((a, b) => a - b);

      const statRows = [];
      for (const week of playedWeeks) {
        const payload = await client.get(endpoints.weekStats(week));
        for (const raw of asArray(payload)) {
          const { stat, mapper } = parsePlayerMatchStat(raw);
          shape?.add("playerMatchStat", mapper);
          if (stat && playerIds.has(stat.playerId)) {
            statRows.push({ ...stat, matchday: week });
          }
        }
      }
      stats.playerMatchStats = statRows.length;
      log(`Estadísticas por jornada: ${statRows.length} registros`);

      if (db && statRows.length > 0) {
        for (const batch of chunk(statRows)) {
          await db
            .insert(playerMatchStats)
            .values(batch)
            .onConflictDoUpdate({
              target: [playerMatchStats.playerId, playerMatchStats.matchday],
              set: {
                minutes: sql`excluded.minutes`,
                points: sql`excluded.points`,
                started: sql`excluded.started`,
              },
            });
        }
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

      const valueRows = parsedPlayers
        .filter((p) => p.marketValue !== null)
        .map((p) => ({
          capturedOn,
          playerId: p.id,
          marketValue: p.marketValue as number,
          totalPoints: p.totalPoints,
          status: p.status,
          ownedCount: ownership.get(p.id) ?? 0,
          onMarket: onMarket.has(p.id),
        }));

      for (const batch of chunk(valueRows)) {
        await db
          .insert(playerValueSnapshots)
          .values(batch)
          .onConflictDoUpdate({
            target: [
              playerValueSnapshots.capturedOn,
              playerValueSnapshots.playerId,
            ],
            set: {
              marketValue: sql`excluded.market_value`,
              totalPoints: sql`excluded.total_points`,
              status: sql`excluded.status`,
              ownedCount: sql`excluded.owned_count`,
              onMarket: sql`excluded.on_market`,
            },
          });
      }
      stats.valueSnapshots = valueRows.length;

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

/** Última sincronización, para el panel de estado. */
export async function lastSyncRun() {
  const db = getDb();
  const [run] = await db
    .select()
    .from(syncRuns)
    .orderBy(sql`${syncRuns.startedAt} DESC`)
    .limit(1);
  return run ?? null;
}

export { inArray };
