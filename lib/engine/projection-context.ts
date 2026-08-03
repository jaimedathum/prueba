import { asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { matches, playerMatchStats } from "@/lib/db/schema";
import {
  computePositionAverages,
  expectedPoints,
  type ExpectedPointsResult,
  type LeagueContext,
  type PlayerHistory,
} from "./expected-points";
import {
  fitTeamModel,
  outlookFor,
  predictMatch,
  type MatchResult,
  type TeamModel,
} from "./team-model";

/**
 * Contexto compartido de proyección.
 *
 * Ajustar el modelo de equipos y reconstruir el historial de cada jugador es
 * caro y lo necesitan por igual la alineación y el mercado. Se hace una vez y
 * se reutiliza, y de paso cualquier jugador —tuyo o del mercado— se proyecta
 * exactamente con el mismo criterio. Comparar peras con peras importa cuando
 * la decisión es cambiar una por otra.
 */

export interface PlayerSeed {
  playerId: string;
  name: string;
  positionId: number;
  status: string;
  realTeamId: string | null;
  totalPoints: number | null;
}

export interface ProjectionContext {
  model: TeamModel;
  league: LeagueContext;
  nextMatchday: number | null;
  totalMatchdays: number;
  project(seed: PlayerSeed): ExpectedPointsResult;
  matchPointsOf(playerId: string): number[] | undefined;
  warnings: string[];
}

const DEFAULT_AVERAGE_GOALS = 1.3;
const DEFAULT_CLEAN_SHEET = 0.3;

export async function buildProjectionContext(
  seeds: PlayerSeed[],
): Promise<ProjectionContext> {
  const db = getDb();
  const warnings: string[] = [];

  const finished = await db
    .select()
    .from(matches)
    .where(eq(matches.finished, true))
    .orderBy(asc(matches.matchday));

  const results: MatchResult[] = finished
    .filter((m) => m.homeGoals !== null && m.awayGoals !== null)
    .map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.homeGoals!,
      awayGoals: m.awayGoals!,
      playedAt: m.kickoffAt ?? new Date(2026, 0, m.matchday),
    }));

  const model = fitTeamModel(results);
  if (!model.converged) {
    warnings.push(
      `Solo hay ${results.length} partidos con resultado: el modelo de equipos ` +
        "todavía no es fiable y el ajuste por rival apenas mueve la proyección.",
    );
  }

  const upcoming = await db
    .select()
    .from(matches)
    .where(eq(matches.finished, false))
    .orderBy(asc(matches.matchday));

  const nextMatchday = upcoming[0]?.matchday ?? null;
  const nextFixture = new Map<string, { opponentId: string; isHome: boolean }>();
  for (const match of upcoming) {
    if (nextMatchday !== null && match.matchday !== nextMatchday) continue;
    nextFixture.set(match.homeTeamId, {
      opponentId: match.awayTeamId,
      isHome: true,
    });
    nextFixture.set(match.awayTeamId, {
      opponentId: match.homeTeamId,
      isHome: false,
    });
  }

  const statRows = await db
    .select()
    .from(playerMatchStats)
    .where(isNotNull(playerMatchStats.minutes));

  const aggregated = new Map<
    string,
    {
      minutes: number;
      points: number;
      appearances: number;
      starts: number;
      perMatch: number[];
    }
  >();

  for (const row of statRows) {
    const current = aggregated.get(row.playerId) ?? {
      minutes: 0,
      points: 0,
      appearances: 0,
      starts: 0,
      perMatch: [] as number[],
    };
    current.minutes += row.minutes ?? 0;
    current.points += row.points ?? 0;
    if ((row.minutes ?? 0) > 0) current.appearances++;
    if (row.started) current.starts++;
    current.perMatch.push(row.points ?? 0);
    aggregated.set(row.playerId, current);
  }

  if (statRows.length === 0) {
    warnings.push(
      "Sin estadísticas por jornada: la titularidad se estima solo con el " +
        "estado del jugador y la proyección usa la media de su posición.",
    );
  }

  const totalMatchdays = new Set(finished.map((m) => m.matchday)).size;

  const historyOf = (seed: PlayerSeed): PlayerHistory => {
    const history = aggregated.get(seed.playerId);
    return {
      playerId: seed.playerId,
      name: seed.name,
      positionId: seed.positionId,
      minutesPlayed: history?.minutes ?? 0,
      fantasyPoints: history?.points ?? seed.totalPoints ?? 0,
      appearances: history?.appearances ?? 0,
      starts: history?.starts ?? 0,
      teamMatches: totalMatchdays,
    };
  };

  const league: LeagueContext = {
    pointsPer90ByPosition: computePositionAverages(seeds.map(historyOf)),
    averageGoalsFor:
      results.length > 0
        ? results.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0) /
          (results.length * 2)
        : DEFAULT_AVERAGE_GOALS,
    averageCleanSheetProbability: averageCleanSheet(model, upcoming),
  };

  return {
    model,
    league,
    nextMatchday,
    totalMatchdays,
    warnings,
    matchPointsOf: (playerId) => aggregated.get(playerId)?.perMatch,
    project(seed) {
      const fixture = seed.realTeamId
        ? nextFixture.get(seed.realTeamId)
        : undefined;
      const outlook =
        fixture && seed.realTeamId
          ? outlookFor(model, seed.realTeamId, fixture.opponentId, fixture.isHome)
          : null;

      return expectedPoints(
        {
          player: historyOf(seed),
          status: seed.status,
          consensusStartProbability: null,
          outlook,
        },
        league,
      );
    },
  };
}

function averageCleanSheet(
  model: TeamModel,
  upcoming: Array<{ homeTeamId: string; awayTeamId: string }>,
): number {
  if (upcoming.length === 0 || model.teams.size === 0) return DEFAULT_CLEAN_SHEET;
  let total = 0;
  let count = 0;
  for (const match of upcoming) {
    const prediction = predictMatch(model, match.homeTeamId, match.awayTeamId);
    total += prediction.homeCleanSheet + prediction.awayCleanSheet;
    count += 2;
  }
  return count > 0 ? total / count : DEFAULT_CLEAN_SHEET;
}
