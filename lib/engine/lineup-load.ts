import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { managers, players, rosterEntries } from "@/lib/db/schema";
import { FALLBACK_FORMATIONS, type PositionCode } from "@/lib/domain/positions";
import type { LeagueContext } from "./expected-points";
import {
  optimizeLineup,
  type Formation,
  type LineupCandidate,
  type LineupResult,
} from "./lineup";
import { buildProjectionContext } from "./projection-context";
import type { TeamModel } from "./team-model";

/**
 * Ensamblado de la fase 2: plantilla → proyección → once óptimo.
 *
 * El trabajo pesado (ajustar el modelo de equipos, reconstruir historiales)
 * vive en `projection-context.ts` y lo comparte con el mercado, para que un
 * jugador tuyo y uno del mercado se proyecten exactamente igual. Comparar
 * peras con peras importa cuando la decisión es cambiar una por otra.
 */

export interface LineupDashboard {
  lineup: LineupResult | null;
  model: TeamModel;
  league: LeagueContext;
  nextMatchday: number | null;
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

  const [me] = await db
    .select()
    .from(managers)
    .where(eq(managers.isMe, true))
    .limit(1);
  if (!me) return null;

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

  const context = await buildProjectionContext(squad);
  const warnings = [...context.warnings];

  const explanations = new Map<string, string>();
  const candidates: LineupCandidate[] = squad.map((seed) => {
    const projection = context.project(seed);
    explanations.set(seed.playerId, projection.explanation);

    return {
      playerId: seed.playerId,
      name: seed.name,
      positionId: seed.positionId,
      expectedPoints: projection.expectedPoints,
      riskOfZero: projection.riskOfZero,
      matchPoints: context.matchPointsOf(seed.playerId),
    };
  });

  warnings.push(
    "Los onces probables aún no se cruzan con la plantilla, así que la " +
      "titularidad sale de la racha. Es la mejora que más subiría la precisión.",
  );

  return {
    lineup: optimizeLineup(candidates, FORMATIONS),
    model: context.model,
    league: context.league,
    nextMatchday: context.nextMatchday,
    warnings,
    candidates,
    explanations,
  };
}
