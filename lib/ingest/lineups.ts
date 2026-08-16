import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lineupPredictions, players, realTeams } from "@/lib/db/schema";
import {
  buildPlayerIndex,
  matchPlayer,
  normalizeName,
} from "@/lib/sources/match-players";
import { gatherProbableLineups } from "@/lib/sources/registry";
import type { ProbableLineupSource } from "@/lib/sources/types";

/**
 * Ingesta de onces probables.
 *
 * Esto es lo que faltaba para que `lib/sources/**` sirviera de algo. Los
 * adaptadores, el consenso ponderado y la tabla `lineup_predictions` llevaban
 * escritos desde la fase 0, con sus tests, pero **nadie los llamaba**: el
 * motor de puntos esperados recibía siempre `consensusStartProbability: null`
 * y corría permanentemente con su señal de reserva, la racha de titularidades.
 *
 * Sigue habiendo una incógnita, y está dicha donde toca: los selectores CSS de
 * los adaptadores no se han podido verificar contra el HTML real. Si están
 * mal, `gatherProbableLineups` lo trata como caída —una fuente que responde
 * 200 y devuelve cero entradas casi siempre es marcado cambiado, no una
 * jornada sin titulares— y esta función lo devuelve como aviso en vez de
 * escribir silencio.
 */

export interface LineupIngestResult {
  matchday: number;
  /** Predicciones escritas, ya emparejadas con un jugador real. */
  written: number;
  /** Nombres que ninguna búsqueda resolvió. */
  unmatched: string[];
  /** Nombres con más de un candidato: se descartan a propósito. */
  ambiguous: string[];
  warnings: string[];
}

export interface LineupIngestOptions {
  sources?: ProbableLineupSource[];
  /** false = lee las fuentes pero no escribe (mismo criterio que `--dry-run`). */
  persist?: boolean;
}

export async function ingestProbableLineups(
  matchday: number,
  options: LineupIngestOptions = {},
): Promise<LineupIngestResult> {
  const persist = options.persist ?? true;
  const warnings: string[] = [];

  const { results, failures } = await gatherProbableLineups(
    matchday,
    options.sources,
  );

  for (const failure of failures) {
    warnings.push(failure.message);
  }

  if (results.length === 0) {
    warnings.push(
      "Ninguna fuente de onces probables ha respondido. Los puntos esperados " +
        "se calculan con la racha de titularidades, que es peor señal, y la " +
        "confianza baja en consecuencia.",
    );
    return { matchday, written: 0, unmatched: [], ambiguous: [], warnings };
  }

  const db = getDb();
  const roster = await db
    .select({
      id: players.id,
      name: players.name,
      nickname: players.nickname,
      realTeamId: players.realTeamId,
    })
    .from(players);
  const index = buildPlayerIndex(roster);

  // Las fuentes nombran al equipo, no lo identifican. Se traduce aquí para
  // poder usarlo como desempate en el emparejamiento.
  const teams = await db
    .select({ id: realTeams.id, name: realTeams.name })
    .from(realTeams);
  const teamByName = new Map(
    teams.map((team) => [normalizeName(team.name), team.id]),
  );

  const rows: Array<typeof lineupPredictions.$inferInsert> = [];
  const unmatched: string[] = [];
  const ambiguous: string[] = [];

  for (const result of results) {
    for (const entry of result.entries) {
      const teamId = entry.teamName
        ? (teamByName.get(normalizeName(entry.teamName)) ?? null)
        : null;
      const outcome = matchPlayer(index, entry.playerName, teamId);

      if (outcome.status === "not-found") {
        unmatched.push(entry.playerName);
        continue;
      }
      if (outcome.status === "ambiguous") {
        ambiguous.push(entry.playerName);
        continue;
      }

      rows.push({
        source: result.source,
        matchday,
        playerId: outcome.playerId,
        predictedStarter: entry.starter,
        confidence: entry.confidence,
        capturedAt: result.fetchedAt,
      });
    }
  }

  if (persist && rows.length > 0) {
    await db
      .insert(lineupPredictions)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          lineupPredictions.source,
          lineupPredictions.matchday,
          lineupPredictions.playerId,
        ],
        // Reingerir la misma jornada actualiza la predicción en vez de
        // duplicarla: las fuentes cambian de opinión según se acerca el
        // partido, y lo último que dicen es lo que vale.
        set: {
          predictedStarter: sql`excluded.predicted_starter`,
          confidence: sql`excluded.confidence`,
          capturedAt: sql`excluded.captured_at`,
        },
      });
  }

  if (unmatched.length > 0) {
    warnings.push(
      `${unmatched.length} nombres de las fuentes no se han podido emparejar ` +
        `con ningún jugador (${unmatched.slice(0, 5).join(", ")}…).`,
    );
  }
  if (ambiguous.length > 0) {
    warnings.push(
      `${ambiguous.length} nombres tenían más de un candidato y se han ` +
        `descartado a propósito (${ambiguous.slice(0, 5).join(", ")}…): ` +
        "elegir mal movería la titularidad del jugador equivocado.",
    );
  }

  return {
    matchday,
    written: persist ? rows.length : 0,
    unmatched,
    ambiguous,
    warnings,
  };
}
