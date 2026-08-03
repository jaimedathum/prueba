import { positionCode, type PositionCode } from "@/lib/domain/positions";
import { solveAssignment } from "./assignment";

/**
 * Optimizador de alineación.
 *
 * Dos modos, porque el objetivo correcto depende de la situación:
 *
 * 1. **Valor esperado** (liga por puntos totales, el caso normal): maximizar
 *    la suma de puntos esperados. Se resuelve **exacto**: se enumeran todas
 *    las formaciones legales y para cada una se asigna óptimamente con flujo
 *    de coste mínimo. El espacio de formaciones es diminuto, así que no hace
 *    falta heurística ninguna.
 *
 * 2. **Contra un rival concreto** (te juegas la jornada, o vas remontando):
 *    maximizar `P(superar al rival)`. Esto NO se resuelve con medias, hace
 *    falta la distribución completa, y la consecuencia es contraintuitiva:
 *    **cuando vas por detrás, el once óptimo es el de más varianza, no el de
 *    más media**. Aquí sí hay búsqueda local, no óptimo garantizado, y está
 *    dicho.
 */

export interface Formation {
  name: string;
  slots: Record<PositionCode, number>;
}

export interface LineupCandidate {
  playerId: string;
  name: string;
  positionId: number;
  expectedPoints: number;
  /** Probabilidad de no jugar y quedarse a cero. */
  riskOfZero: number;
  /**
   * Posiciones que puede ocupar. Por defecto solo la suya; si el juego
   * permite versatilidad, el optimizador la aprovecha sin cambios.
   */
  eligiblePositions?: number[];
  /**
   * Puntos por partido del histórico. Si están, la simulación remuestrea de
   * ahí en vez de suponer una forma de distribución.
   */
  matchPoints?: number[];
}

export interface LineupResult {
  formation: Formation;
  starters: LineupCandidate[];
  bench: LineupCandidate[];
  expectedPoints: number;
  /** Riesgo agregado: cuántos titulares se espera que no jueguen. */
  expectedMissing: number;
  alternatives: Array<{
    formation: string;
    expectedPoints: number;
    /** Cuánto se pierde por elegir esta formación en vez de la mejor. */
    cost: number;
  }>;
}

const POSITION_IDS: Record<PositionCode, number> = { PT: 1, DF: 2, MC: 3, DL: 4 };

function slotsMap(formation: Formation): Map<number, number> {
  return new Map(
    (Object.keys(formation.slots) as PositionCode[])
      .filter((code) => formation.slots[code] > 0)
      .map((code) => [POSITION_IDS[code], formation.slots[code]]),
  );
}

function eligible(candidate: LineupCandidate): number[] {
  return candidate.eligiblePositions ?? [candidate.positionId];
}

/** Mejor once para una formación concreta. Exacto. */
export function bestForFormation(
  candidates: LineupCandidate[],
  formation: Formation,
): { starters: LineupCandidate[]; expectedPoints: number; feasible: boolean } {
  const result = solveAssignment({
    players: candidates.map((candidate) => ({
      value: candidate.expectedPoints,
      eligiblePositions: eligible(candidate),
    })),
    slots: slotsMap(formation),
  });

  const starters = [...result.assignment.keys()]
    .map((index) => candidates[index]!)
    .sort((a, b) => a.positionId - b.positionId || b.expectedPoints - a.expectedPoints);

  return {
    starters,
    expectedPoints: result.totalValue,
    feasible: result.feasible,
  };
}

export function optimizeLineup(
  candidates: LineupCandidate[],
  formations: Formation[],
): LineupResult | null {
  const evaluated = formations
    .map((formation) => ({ formation, ...bestForFormation(candidates, formation) }))
    .filter((entry) => entry.feasible)
    .sort((a, b) => b.expectedPoints - a.expectedPoints);

  const best = evaluated[0];
  if (!best) return null;

  const startersIds = new Set(best.starters.map((p) => p.playerId));

  return {
    formation: best.formation,
    starters: best.starters,
    bench: candidates
      .filter((candidate) => !startersIds.has(candidate.playerId))
      .sort((a, b) => b.expectedPoints - a.expectedPoints),
    expectedPoints: best.expectedPoints,
    expectedMissing: best.starters.reduce((acc, p) => acc + p.riskOfZero, 0),
    alternatives: evaluated.map((entry) => ({
      formation: entry.formation.name,
      expectedPoints: entry.expectedPoints,
      cost: best.expectedPoints - entry.expectedPoints,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Simulación
 * ------------------------------------------------------------------ */

/**
 * Variabilidad de los puntos por posición cuando no hay histórico de partidos.
 *
 * Un delantero es mucho más irregular que un portero: sus puntos dependen de
 * goles, que son sucesos raros y grumosos. Son constantes de juicio y se
 * marcan como tales; con histórico de partidos la simulación las ignora y
 * remuestrea de los datos reales, que es lo preferible.
 */
export const VARIABILIDAD_POR_POSICION: Record<PositionCode, number> = {
  PT: 0.5,
  DF: 0.7,
  MC: 0.8,
  DL: 1.1,
};

export type Rng = () => number;

/** Una muestra de puntos de un jugador para una jornada. */
export function samplePlayerPoints(
  candidate: LineupCandidate,
  rng: Rng,
): number {
  // ¿Juega? Es la primera fuente de varianza, y la mayor.
  if (rng() < candidate.riskOfZero) return 0;

  const playProbability = Math.max(1e-6, 1 - candidate.riskOfZero);
  const meanGivenPlaying = candidate.expectedPoints / playProbability;

  if (candidate.matchPoints && candidate.matchPoints.length > 0) {
    // Bootstrap: mejor remuestrear lo que de verdad hizo que suponer una forma.
    const index = Math.min(
      candidate.matchPoints.length - 1,
      Math.floor(rng() * candidate.matchPoints.length),
    );
    return candidate.matchPoints[index]!;
  }

  const code = positionCode(candidate.positionId);
  const variability = code === "??" ? 0.8 : VARIABILIDAD_POR_POSICION[code];
  const sd = Math.abs(meanGivenPlaying) * variability;

  // Box-Muller. Los puntos fantasy pueden ser negativos (tarjetas), así que
  // no se trunca en cero.
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return meanGivenPlaying + sd * normal;
}

export function simulateLineup(
  starters: LineupCandidate[],
  iterations: number,
  rng: Rng,
): number[] {
  const totals = new Array<number>(iterations);
  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (const starter of starters) total += samplePlayerPoints(starter, rng);
    totals[i] = total;
  }
  return totals;
}

export interface RivalComparison {
  probabilityOfWinning: number;
  expectedPoints: number;
  formation: Formation;
  starters: LineupCandidate[];
}

export interface AgainstRivalOptions {
  iterations?: number;
  rng?: Rng;
  /** Rondas de búsqueda local sobre el once. */
  rounds?: number;
}

function probabilityOfBeating(
  mine: LineupCandidate[],
  rivalSamples: number[],
  iterations: number,
  rng: Rng,
): number {
  const mySamples = simulateLineup(mine, iterations, rng);
  let wins = 0;
  for (let i = 0; i < iterations; i++) {
    // Se emparejan muestras independientes: cada iteración es una jornada.
    if (mySamples[i]! > rivalSamples[i % rivalSamples.length]!) wins++;
  }
  return wins / iterations;
}

/**
 * Once que maximiza la probabilidad de superar al rival.
 *
 * Búsqueda local por intercambios de un jugador partiendo del once de máximo
 * valor esperado. **No garantiza el óptimo global** — el espacio de onces es
 * demasiado grande para recorrerlo entero — pero encuentra sistemáticamente
 * los cambios que importan: meter jugadores irregulares cuando hace falta
 * remontar, y quitarlos cuando basta con no fallar.
 */
export function optimizeAgainstRival(
  candidates: LineupCandidate[],
  formations: Formation[],
  rivalSamples: number[],
  options: AgainstRivalOptions = {},
): RivalComparison | null {
  const iterations = options.iterations ?? 5000;
  const rounds = options.rounds ?? 2;
  const rng = options.rng ?? Math.random;

  const baseline = optimizeLineup(candidates, formations);
  if (!baseline) return null;

  let bestFormation = baseline.formation;
  let bestStarters = baseline.starters;
  let bestProbability = probabilityOfBeating(
    bestStarters,
    rivalSamples,
    iterations,
    rng,
  );

  for (let round = 0; round < rounds; round++) {
    let improved = false;

    const startersIds = new Set(bestStarters.map((p) => p.playerId));
    const bench = candidates.filter((c) => !startersIds.has(c.playerId));

    for (let i = 0; i < bestStarters.length; i++) {
      const out = bestStarters[i]!;
      for (const incoming of bench) {
        // Solo intercambios que respetan la formación.
        if (!eligible(incoming).includes(out.positionId)) continue;

        const trial = [...bestStarters];
        trial[i] = incoming;
        const probability = probabilityOfBeating(
          trial,
          rivalSamples,
          iterations,
          rng,
        );

        if (probability > bestProbability) {
          bestProbability = probability;
          bestStarters = trial;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return {
    probabilityOfWinning: bestProbability,
    expectedPoints: bestStarters.reduce((acc, p) => acc + p.expectedPoints, 0),
    formation: bestFormation,
    starters: bestStarters,
  };
}

/** Generador reproducible, para tests y para poder repetir un análisis. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}
