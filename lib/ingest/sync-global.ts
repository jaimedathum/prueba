import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  matches,
  playerMatchStats,
  playerValueSnapshots,
  players,
  realTeams,
} from "@/lib/db/schema";
import { FantasyClient } from "@/lib/fantasy/client";
import { endpoints } from "@/lib/fantasy/endpoints";
import { ingestProbableLineups } from "./lineups";
import { ShapeCollector } from "./mapper";
import {
  parseMatch,
  parsePlayer,
  parsePlayerMatchStat,
  parseRealTeam,
  type ParsedPlayer,
  type ParsedRealTeam,
} from "./parse";
import { asArray, chunk, today } from "./util";

/**
 * La mitad de la sincronización que es **igual para todo el mundo**.
 *
 * Catálogo de jugadores, equipos reales, calendario, estadísticas por jornada
 * y onces probables: nada de esto depende de en qué liga estés. Y es, con
 * diferencia, la mayor parte de las peticiones — el calendario solo son 38
 * llamadas, y las estadísticas otras tantas.
 *
 * Separarlo no es orden por el orden: es lo que hace que el coste crezca con
 * el número de **ligas** y no con el de usuarios. Con el modelo gratuito eso
 * deja de ser una optimización y pasa a ser la condición de que la factura no
 * se dispare con cada persona que se registra.
 *
 * Se ejecuta **una vez al día en total**, con la credencial de la cuenta que
 * sea: la API devuelve lo mismo para cualquiera.
 */

export interface GlobalSyncOptions {
  client?: FantasyClient;
  accountId?: string;
  persist?: boolean;
  collectShape?: boolean;
  log?: (message: string) => void;
  shape?: ShapeCollector | null;
}

export interface GlobalSyncResult {
  /** Para que la mitad por liga no tenga que volver a pedirlos. */
  players: ParsedPlayer[];
  /** Jornada en curso, o `null` si no se ha podido determinar. */
  currentWeek: number | null;
  stats: Record<string, number>;
  warnings: string[];
}

export async function syncGlobal(
  options: GlobalSyncOptions = {},
): Promise<GlobalSyncResult> {
  const persist = options.persist ?? true;
  const log = options.log ?? (() => {});
  const shape = options.shape ?? null;
  const warnings: string[] = [];
  const stats: Record<string, number> = {};

  const client = options.client ?? new FantasyClient({ accountId: options.accountId });
  const db = persist ? getDb() : null;

  /* --- Jugadores y equipos reales --------------------------------- */

  const playersPayload = await client.get(endpoints.players());
  const parsedPlayers: ParsedPlayer[] = [];
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
    // aborta el INSERT entero y con él la sincronización. Igual que en el feed
    // de actividad, un id desconocido vacía el vínculo pero no tumba la
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

  const playerIds = new Set(parsedPlayers.map((p) => p.id));

  /* --- Calendario y estadísticas por jornada ---------------------- */
  // Sin resultados reales no hay modelo de equipos, y sin él los puntos
  // esperados pierden el ajuste por rival y la portería a cero.

  const weekPayload = await client.get(endpoints.currentWeek());
  const rawWeek =
    (weekPayload as Record<string, unknown> | null)?.["weekNumber"] ??
    (weekPayload as Record<string, unknown> | null)?.["week"] ??
    null;
  const currentWeek =
    typeof rawWeek === "number" ? rawWeek : Number(rawWeek) || null;

  if (currentWeek === null) {
    warnings.push(
      "No se ha podido determinar la jornada actual: no se sincronizan " +
        "resultados ni estadísticas, y el modelo de equipos se queda sin datos.",
    );
  } else {
    const parsedMatches = [];
    for (let week = 1; week <= currentWeek; week++) {
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

  /* --- Onces probables -------------------------------------------- */
  /**
   * Ningún fallo de aquí puede tumbar la sincronización: es una mejora de la
   * proyección, no un requisito.
   */
  if (currentWeek !== null) {
    try {
      const lineups = await ingestProbableLineups(currentWeek + 1, { persist });
      stats.lineupPredictions = lineups.written;
      warnings.push(...lineups.warnings);
      if (lineups.written > 0) {
        log(`Onces probables: ${lineups.written} predicciones`);
      }
    } catch (error) {
      warnings.push(
        "No se han podido leer los onces probables: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /* --- Snapshot de valor ------------------------------------------ */
  /**
   * Valor, puntos y estado: lo que la API dice del jugador, igual para
   * cualquiera. Cuánta gente lo tiene y si está en el mercado se guardan
   * aparte, en `player_league_snapshots`, porque eso **sí** depende de la liga
   * — `value.ts` calcula `ownedCount / leagueSize`.
   */
  if (db) {
    const capturedOn = today();
    const valueRows = parsedPlayers
      .filter((p) => p.marketValue !== null)
      .map((p) => ({
        capturedOn,
        playerId: p.id,
        marketValue: p.marketValue as number,
        totalPoints: p.totalPoints,
        status: p.status,
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
          },
        });
    }
    stats.valueSnapshots = valueRows.length;
  }

  return { players: parsedPlayers, currentWeek, stats, warnings };
}
