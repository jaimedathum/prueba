import { asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  managers,
  matches,
  playerMatchStats,
  players,
  rosterEntries,
} from "@/lib/db/schema";
import { FALLBACK_FORMATIONS, type PositionCode } from "@/lib/domain/positions";
import {
  computePositionAverages,
  expectedPoints,
  type LeagueContext,
  type PlayerHistory,
} from "./expected-points";
import {
  optimizeLineup,
  type Formation,
  type LineupCandidate,
  type LineupResult,
} from "./lineup";
import {
  fitTeamModel,
  outlookFor,
  predictMatch,
  type MatchResult,
  type TeamModel,
} from "./team-model";

/**
 * Ensamblado de la fase 2: resultados reales → modelo de equipos → puntos
 * esperados → once óptimo.
 *
 * Cada eslabón degrada solo si le falta su insumo, y lo dice. Sin resultados
 * no hay ajuste por rival pero sigue habiendo once; sin estadísticas por
 * jornada no hay racha de titularidades pero sigue habiendo proyección. Lo que
 * no se hace nunca es rellenar el hueco con un número inventado.
 */

export interface LineupDashboard {
  lineup: LineupResult | null;
  model: TeamModel;
  league: LeagueContext;
  nextMatchday: number | null;
  /** Avisos sobre datos que faltan y qué se pierde por ello. */
  warnings: string[];
  candidates: LineupCandidate[];
  explanations: Map<string, string>;
}

const FORMATIONS: Formation[] = FALLBACK_FORMATIONS.map((slots) => ({
  name: `${slots.DF}-${slots.MC}-${slots.DL}`,
  slots: slots as Record<PositionCode, number>,
}));

export async function getLineupDashboard(): Promise<LineupDashboard | null> {
  const db = getDb();
  const warnings: string[] = [];

  const [me] = await db
    .select()
    .from(managers)
    .where(eq(managers.isMe, true))
    .limit(1);
  if (!me) return null;

  /* --- Modelo de equipos ------------------------------------------ */

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
      // Sin hora de partido se usa la jornada como sustituto del tiempo, que
      // para el decaimiento sirve igual: lo que importa es el orden.
      playedAt: m.kickoffAt ?? new Date(2026, 0, m.matchday),
    }));

  const model = fitTeamModel(results);

  if (!model.converged) {
    warnings.push(
      `Solo hay ${results.length} partidos con resultado: el modelo de equipos ` +
        "no es fiable todavía y el ajuste por rival apenas mueve la proyección.",
    );
  }

  /* --- Próximo partido de cada equipo ------------------------------ */

  const upcoming = await db
    .select()
    .from(matches)
    .where(eq(matches.finished, false))
    .orderBy(asc(matches.matchday));

  const nextMatchday = upcoming[0]?.matchday ?? null;
  const nextFixture = new Map<
    string,
    { opponentId: string; isHome: boolean }
  >();

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

  if (nextMatchday === null) {
    warnings.push(
      "No hay ninguna jornada pendiente en el calendario sincronizado.",
    );
  }

  /* --- Historial por jugador --------------------------------------- */

  const statRows = await db
    .select()
    .from(playerMatchStats)
    .where(isNotNull(playerMatchStats.minutes));

  const historyByPlayer = new Map<
    string,
    { minutes: number; points: number; appearances: number; starts: number; perMatch: number[] }
  >();

  for (const row of statRows) {
    const current = historyByPlayer.get(row.playerId) ?? {
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
    historyByPlayer.set(row.playerId, current);
  }

  const totalMatchdays = new Set(finished.map((m) => m.matchday)).size;

  if (statRows.length === 0) {
    warnings.push(
      "Sin estadísticas por jornada: la titularidad se estima solo con el " +
        "estado del jugador, y la proyección usa la media de su posición.",
    );
  }

  /* --- Mi plantilla ------------------------------------------------ */

  const squad = await db
    .select({
      playerId: players.id,
      name: players.name,
      positionId: players.positionId,
      status: players.status,
      realTeamId: players.realTeamId,
      totalPoints: players.totalPoints,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.id, rosterEntries.playerId))
    .where(eq(rosterEntries.managerId, me.id));

  const histories: PlayerHistory[] = squad.map((row) => {
    const history = historyByPlayer.get(row.playerId);
    return {
      playerId: row.playerId,
      name: row.name,
      positionId: row.positionId,
      minutesPlayed: history?.minutes ?? 0,
      fantasyPoints: history?.points ?? row.totalPoints ?? 0,
      appearances: history?.appearances ?? 0,
      starts: history?.starts ?? 0,
      teamMatches: totalMatchdays,
    };
  });

  const league: LeagueContext = {
    pointsPer90ByPosition: computePositionAverages(histories),
    averageGoalsFor: averageGoalsFor(results),
    averageCleanSheetProbability: averageCleanSheet(model, upcoming),
  };

  /* --- Puntos esperados y once ------------------------------------- */

  const explanations = new Map<string, string>();
  const candidates: LineupCandidate[] = squad.map((row, index) => {
    const fixture = row.realTeamId ? nextFixture.get(row.realTeamId) : undefined;
    const outlook =
      fixture && row.realTeamId
        ? outlookFor(model, row.realTeamId, fixture.opponentId, fixture.isHome)
        : null;

    const projection = expectedPoints(
      {
        player: histories[index]!,
        status: row.status,
        // Todavía no hay onces probables emparejados en base de datos: se cae
        // a la racha de titularidades y la confianza baja sola.
        consensusStartProbability: null,
        outlook,
      },
      league,
    );

    explanations.set(row.playerId, projection.explanation);

    return {
      playerId: row.playerId,
      name: row.name,
      positionId: row.positionId,
      expectedPoints: projection.expectedPoints,
      riskOfZero: projection.riskOfZero,
      matchPoints: historyByPlayer.get(row.playerId)?.perMatch,
    };
  });

  warnings.push(
    "Los onces probables aún no se cruzan con la plantilla, así que la " +
      "titularidad sale de la racha. Es la mejora que más subiría la precisión.",
  );

  return {
    lineup: optimizeLineup(candidates, FORMATIONS),
    model,
    league,
    nextMatchday,
    warnings,
    candidates,
    explanations,
  };
}

function averageGoalsFor(results: MatchResult[]): number {
  if (results.length === 0) return 1.3;
  const total = results.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0);
  return total / (results.length * 2);
}

function averageCleanSheet(
  model: TeamModel,
  upcoming: Array<{ homeTeamId: string; awayTeamId: string }>,
): number {
  if (upcoming.length === 0 || model.teams.size === 0) return 0.3;
  let total = 0;
  let count = 0;
  for (const match of upcoming) {
    const prediction = predictMatch(model, match.homeTeamId, match.awayTeamId);
    total += prediction.homeCleanSheet + prediction.awayCleanSheet;
    count += 2;
  }
  return count > 0 ? total / count : 0.3;
}
