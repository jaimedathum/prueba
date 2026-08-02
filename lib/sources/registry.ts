import { and, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lineupPredictions } from "@/lib/db/schema";
import { combineVotes, type SourceAccuracy, type SourceVote } from "./consensus";
import { FutbolFantasySource } from "./futbolfantasy";
import { JornadaPerfectaSource } from "./jornadaperfecta";
import {
  SourceUnavailableError,
  type ProbableLineupEntry,
  type ProbableLineupSource,
  type SourceResult,
} from "./types";

/**
 * Orquestación de las fuentes secundarias.
 *
 * Degradación elegante: si una fuente falla se registra y se sigue con el
 * resto; si fallan todas, el motor de puntos esperados lo sabrá (cero votos) y
 * caerá a su señal de reserva, la racha de titularidades, bajando la confianza
 * en vez de fingir que la sabe.
 */

export function defaultLineupSources(): ProbableLineupSource[] {
  return [new JornadaPerfectaSource(), new FutbolFantasySource()];
}

export interface GatherResult {
  results: SourceResult<ProbableLineupEntry>[];
  failures: SourceUnavailableError[];
}

export async function gatherProbableLineups(
  matchday: number,
  sources: ProbableLineupSource[] = defaultLineupSources(),
): Promise<GatherResult> {
  const results: SourceResult<ProbableLineupEntry>[] = [];
  const failures: SourceUnavailableError[] = [];

  // En serie y no en paralelo: son webs gratuitas, no hay prisa.
  for (const source of sources) {
    try {
      const result = await source.fetchProbableLineups(matchday);
      if (result.entries.length === 0) {
        // Una fuente que responde 200 pero no devuelve nada casi siempre
        // significa que cambió el marcado. Se trata como caída, no como
        // "hoy no juega nadie".
        failures.push(
          new SourceUnavailableError(
            source.name,
            new Error(
              "0 entradas extraídas: probablemente hayan cambiado los selectores",
            ),
          ),
        );
        continue;
      }
      results.push(result);
    } catch (error) {
      failures.push(new SourceUnavailableError(source.name, error));
    }
  }

  return { results, failures };
}

/** Acierto medido de cada fuente sobre predicciones ya contrastadas. */
export async function measuredAccuracies(): Promise<Map<string, SourceAccuracy>> {
  const db = getDb();
  const rows = await db
    .select({
      source: lineupPredictions.source,
      samples: sql<number>`count(*)::int`,
      hits: sql<number>`sum(case when ${lineupPredictions.predictedStarter} = ${lineupPredictions.actualStarter} then 1 else 0 end)::int`,
    })
    .from(lineupPredictions)
    .where(and(isNotNull(lineupPredictions.actualStarter)))
    .groupBy(lineupPredictions.source);

  return new Map(
    rows.map((row) => [
      row.source,
      { source: row.source, samples: row.samples, hits: row.hits },
    ]),
  );
}

/**
 * Consenso por jugador a partir de los resultados de todas las fuentes.
 * `entriesByPlayer` ya viene con los nombres emparejados a ids reales.
 */
export function consensusByPlayer(
  entriesByPlayer: Map<string, Array<{ source: string; entry: ProbableLineupEntry }>>,
  accuracies: Map<string, SourceAccuracy>,
) {
  const out = new Map<string, ReturnType<typeof combineVotes>>();

  for (const [playerId, votes] of entriesByPlayer) {
    const sourceVotes: SourceVote[] = votes.map(({ source, entry }) => ({
      source,
      probability:
        entry.confidence !== null
          ? Math.min(1, Math.max(0, entry.confidence / 100))
          : entry.starter
            ? 1
            : 0,
    }));
    out.set(playerId, combineVotes(sourceVotes, accuracies));
  }

  return out;
}
