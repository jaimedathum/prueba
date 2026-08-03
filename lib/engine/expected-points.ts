import { positionCode, type PositionCode } from "@/lib/domain/positions";
import type { TeamOutlook } from "./team-model";

/**
 * Puntos esperados de un jugador para una jornada.
 *
 *     EP = P(titular) · E[puntos | titular] + P(suplente) · E[puntos | suplente]
 *
 * La decisión de diseño importante: **no se modelan puntos, se modelan
 * minutos**. El 80% de la varianza de un jugador en fantasy es "¿juega?", no
 * "¿cuánto rinde cuando juega". Un crack que no es titular vale cero.
 *
 * La segunda: los puntos por 90 minutos se estiman con **shrinkage bayesiano**
 * hacia la media de su posición. Sin eso, dos partidazos disparan la
 * proyección de un jugador que en realidad es del montón, que es el error
 * clásico de quien mira medias a pelo.
 *
 * Y la tercera: el ajuste por rival **no** usa una escala de dificultad
 * inventada del 1 al 5, sino los goles esperados y la probabilidad de portería
 * a cero que salen del modelo Dixon-Coles.
 *
 * Nota sobre el baremo de puntuación: este motor no lo necesita. Trabaja con
 * los puntos fantasy históricos que ya devuelve la API, así que no depende de
 * una tabla de "cuántos puntos vale un gol" que no está confirmada.
 */

export interface PlayerHistory {
  playerId: string;
  name: string;
  positionId: number;
  /** Minutos jugados en el periodo observado. */
  minutesPlayed: number;
  /** Puntos fantasy acumulados en ese mismo periodo. */
  fantasyPoints: number;
  appearances: number;
  starts: number;
  /** Partidos que ha disputado su equipo: el denominador de la titularidad. */
  teamMatches: number;
}

export interface ExpectedPointsInput {
  player: PlayerHistory;
  /** 'ok' | 'injured' | 'doubtful' | 'suspended' | 'unknown' */
  status: string;
  /**
   * Probabilidad de ser titular según el consenso de fuentes externas.
   * `null` = ninguna fuente ha opinado, y se cae a la racha de titularidades
   * bajando la confianza.
   */
  consensusStartProbability: number | null;
  /** Perspectiva del partido, del modelo de equipos. `null` = sin partido conocido. */
  outlook: TeamOutlook | null;
}

export interface LeagueContext {
  /** Puntos por 90 minutos medios de cada posición, para el shrinkage. */
  pointsPer90ByPosition: Map<number, number>;
  averageGoalsFor: number;
  averageCleanSheetProbability: number;
}

export interface ExpectedPointsResult {
  playerId: string;
  name: string;
  positionId: number;
  expectedPoints: number;
  startProbability: number;
  expectedMinutes: number;
  pointsPer90: number;
  fixtureMultiplier: number;
  /** Probabilidad de no sumar nada porque no juega. Lo que decide el riesgo. */
  riskOfZero: number;
  confidence: "high" | "medium" | "low";
  explanation: string;
}

/** Fuerza del prior del shrinkage, en partidos completos equivalentes. */
const SHRINKAGE_PARTIDOS = 6;

const MINUTOS_TITULAR_POR_DEFECTO = 78;
const MINUTOS_SUPLENTE_POR_DEFECTO = 18;

/**
 * Cuánto de los puntos de cada posición depende de que el equipo no encaje,
 * frente a que ataque bien.
 *
 * Son constantes de juicio, no medidas, y se marcan como tales: en cuanto haya
 * unas cuantas jornadas de histórico propio se pueden estimar de verdad
 * regresando los puntos de cada jugador sobre las porterías a cero de su
 * equipo. Se dejan configurables por eso.
 */
export const PESO_DEFENSIVO_POR_DEFECTO: Record<PositionCode, number> = {
  PT: 0.6,
  DF: 0.45,
  MC: 0.2,
  DL: 0.05,
};

export interface ExpectedPointsOptions {
  defensiveWeight?: Record<PositionCode, number>;
  shrinkageMatches?: number;
}

/**
 * Tasa de puntos por 90 minutos, suavizada hacia la media de la posición.
 *
 *     r̂ = (n · r_jugador + k · r_posición) / (n + k),   n = minutos / 90
 */
export function shrunkPointsPer90(
  player: PlayerHistory,
  positionAverage: number,
  shrinkageMatches = SHRINKAGE_PARTIDOS,
): number {
  const n = player.minutesPlayed / 90;
  if (n <= 0) return positionAverage;
  const observed = (player.fantasyPoints / player.minutesPlayed) * 90;
  return (
    (n * observed + shrinkageMatches * positionAverage) / (n + shrinkageMatches)
  );
}

/**
 * Probabilidad de ser titular.
 *
 * Lesión y sanción son puertas duras: da igual lo que diga cualquier fuente,
 * un sancionado no juega. La duda no se convierte en un sí ni en un no, se
 * queda a medias, que es lo honesto.
 */
export function startProbabilityFor(input: ExpectedPointsInput): {
  probability: number;
  source: "status" | "consensus" | "streak";
  /**
   * Falso cuando el jugador no puede jugar en absoluto. Es distinto de "no
   * es titular": un no titular puede entrar desde el banquillo, un lesionado
   * no. Sin esta distinción, un lesionado acabaría sumando puntos de suplente.
   */
  available: boolean;
} {
  const { player, status, consensusStartProbability } = input;

  if (status === "injured" || status === "suspended") {
    return { probability: 0, source: "status", available: false };
  }

  if (consensusStartProbability !== null) {
    const adjusted =
      status === "doubtful"
        ? consensusStartProbability * 0.5
        : consensusStartProbability;
    return {
      probability: clamp01(adjusted),
      source: "consensus",
      available: true,
    };
  }

  // Sin fuentes: la racha de titularidades es la mejor señal que queda.
  const streak =
    player.teamMatches > 0 ? player.starts / player.teamMatches : 0.5;
  const adjusted = status === "doubtful" ? streak * 0.5 : streak;
  return { probability: clamp01(adjusted), source: "streak", available: true };
}

/**
 * Ajuste por rival. Reparte los puntos del jugador entre la parte que depende
 * de que su equipo no encaje y la que depende de que ataque, y escala cada una
 * con lo que predice el modelo de equipos frente a la media de la liga.
 */
export function fixtureMultiplier(
  positionId: number,
  outlook: TeamOutlook | null,
  league: LeagueContext,
  defensiveWeight = PESO_DEFENSIVO_POR_DEFECTO,
): number {
  if (!outlook) return 1;

  const code = positionCode(positionId);
  const weight = code === "??" ? 0.25 : defensiveWeight[code];

  const attackAdjustment =
    league.averageGoalsFor > 0
      ? outlook.expectedGoalsFor / league.averageGoalsFor
      : 1;
  const defenseAdjustment =
    league.averageCleanSheetProbability > 0
      ? outlook.cleanSheetProbability / league.averageCleanSheetProbability
      : 1;

  const raw = (1 - weight) * attackAdjustment + weight * defenseAdjustment;
  // Un partido no puede triplicar ni anular a un jugador: se acota para que
  // un ajuste de contexto no domine sobre su calidad.
  return Math.min(1.8, Math.max(0.5, raw));
}

export function expectedPoints(
  input: ExpectedPointsInput,
  league: LeagueContext,
  options: ExpectedPointsOptions = {},
): ExpectedPointsResult {
  const { player } = input;

  const positionAverage =
    league.pointsPer90ByPosition.get(player.positionId) ?? 0;
  const pointsPer90 = shrunkPointsPer90(
    player,
    positionAverage,
    options.shrinkageMatches,
  );

  const {
    probability: startProbability,
    source,
    available,
  } = startProbabilityFor(input);
  const multiplier = fixtureMultiplier(
    player.positionId,
    input.outlook,
    league,
    options.defensiveWeight,
  );

  const minutesPerStart =
    player.starts > 0
      ? Math.min(90, player.minutesPlayed / player.starts)
      : MINUTOS_TITULAR_POR_DEFECTO;
  const subAppearances = Math.max(0, player.appearances - player.starts);
  const minutesPerSub =
    subAppearances > 0
      ? Math.min(
          45,
          Math.max(
            1,
            (player.minutesPlayed - player.starts * minutesPerStart) /
              subAppearances,
          ),
        )
      : MINUTOS_SUPLENTE_POR_DEFECTO;

  // Quien no es titular no siempre entra: se reparte lo que queda entre
  // suplente que juega un rato y suplente que no se mueve del banquillo.
  // Un lesionado o sancionado no entra ni de suplente.
  const subProbability = available ? (1 - startProbability) * 0.5 : 0;
  const expectedMinutes =
    startProbability * minutesPerStart + subProbability * minutesPerSub;

  const points = (expectedMinutes / 90) * pointsPer90 * multiplier;

  return {
    playerId: player.playerId,
    name: player.name,
    positionId: player.positionId,
    expectedPoints: points,
    startProbability,
    expectedMinutes,
    pointsPer90,
    fixtureMultiplier: multiplier,
    riskOfZero: 1 - startProbability - subProbability,
    confidence: confidenceFor(player, source, input.outlook !== null),
    explanation: explain(input, startProbability, source, multiplier, pointsPer90),
  };
}

function confidenceFor(
  player: PlayerHistory,
  source: "status" | "consensus" | "streak",
  hasOutlook: boolean,
): ExpectedPointsResult["confidence"] {
  if (source === "status") return "high"; // Un lesionado no juega, y punto.
  const partidos = player.minutesPlayed / 90;
  if (source === "consensus" && hasOutlook && partidos >= 5) return "high";
  if (partidos < 2) return "low";
  return source === "streak" && !hasOutlook ? "low" : "medium";
}

function explain(
  input: ExpectedPointsInput,
  startProbability: number,
  source: "status" | "consensus" | "streak",
  multiplier: number,
  pointsPer90: number,
): string {
  if (source === "status") {
    return input.status === "injured"
      ? "Lesionado: no puntúa."
      : "Sancionado: no puntúa.";
  }

  const partes = [
    `${(startProbability * 100).toFixed(0)}% de ser titular`,
    source === "consensus"
      ? "según los onces probables"
      : "según su racha de titularidades (ninguna fuente ha opinado)",
    `${pointsPer90.toFixed(1)} puntos por 90'`,
  ];

  if (input.outlook) {
    const rival = input.outlook.opponentId;
    const donde = input.outlook.isHome ? "en casa" : "fuera";
    partes.push(
      multiplier >= 1.1
        ? `partido favorable contra ${rival} ${donde} (×${multiplier.toFixed(2)})`
        : multiplier <= 0.9
          ? `partido complicado contra ${rival} ${donde} (×${multiplier.toFixed(2)})`
          : `partido neutro contra ${rival} ${donde}`,
    );
  }

  return partes.join(", ") + ".";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Medias por posición de la propia liga: la base del shrinkage. */
export function computePositionAverages(
  players: PlayerHistory[],
): Map<number, number> {
  const totals = new Map<number, { points: number; minutes: number }>();

  for (const player of players) {
    if (player.minutesPlayed <= 0) continue;
    const current = totals.get(player.positionId) ?? { points: 0, minutes: 0 };
    current.points += player.fantasyPoints;
    current.minutes += player.minutesPlayed;
    totals.set(player.positionId, current);
  }

  return new Map(
    [...totals.entries()].map(([positionId, { points, minutes }]) => [
      positionId,
      minutes > 0 ? (points / minutes) * 90 : 0,
    ]),
  );
}
