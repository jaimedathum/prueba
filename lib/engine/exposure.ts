import { probabilityCanAfford, type AmountPriors, type CashBand } from "./budget";

/**
 * Riesgo de que te claususlen a un jugador.
 *
 * Se modela como un **proceso de Poisson**: cada rival aporta una intensidad
 * de amenaza `λ` y las intensidades se suman. Es preferible a multiplicar
 * factores sueltos por tres razones: las probabilidades salen acotadas en
 * [0,1) sin recortes artificiales, agregar rivales es sumar, y el horizonte
 * temporal entra de forma natural (el riesgo a 14 días es el doble de
 * intensidad que a 7, no el doble de probabilidad).
 *
 *     λ_i = ataques_esperados_i · P(caja_i ≥ C) · atractivo_i · ganga_i
 *     p   = 1 − exp(−Σ λ_i)
 *
 * Cada factor responde a una pregunta distinta: ¿este rival ataca?, ¿puede
 * pagarlo?, ¿le sirve para algo?, ¿le sale a cuenta?
 */

export interface RivalProfile {
  managerId: string;
  cash: CashBand;
  /** Clausulazos ejecutados por este rival en el periodo observado. */
  clauseAttacks: number;
  /** Mejor valor de mercado que tiene en cada posición (positionId → valor). */
  bestValueByPosition: Map<number, number>;
}

export interface ThreatenedPlayer {
  playerId: string;
  positionId: number;
  marketValue: number;
  buyoutClause: number;
  /** Si el juego bloquea la cláusula un rato tras el fichaje. */
  clauseLockedUntil?: Date | null;
}

export interface ExposureOptions {
  /** Días observados de histórico, para convertir ataques en tasa. */
  observedDays: number;
  /** Horizonte de la decisión. Blindar hoy protege durante unos días. */
  horizonDays: number;
  priors: AmountPriors;
  now?: Date;
}

export interface RivalThreat {
  managerId: string;
  lambda: number;
  expectedAttacks: number;
  probabilityCanAfford: number;
  attractiveness: number;
  bargain: number;
}

export interface ExposureResult {
  playerId: string;
  /** Probabilidad de que alguien lo clausule dentro del horizonte. */
  probability: number;
  totalLambda: number;
  threats: RivalThreat[];
  /** Motivo cuando el riesgo es cero por una razón estructural. */
  note: string | null;
}

/** Días equivalentes de prior: con poco histórico nadie parece muy agresivo. */
const PRIOR_DAYS = 30;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Tasa de clausulazos del rival, suavizada hacia la media de la liga.
 * Sin esto, un rival que ha hecho un clausulazo en tres días parecería una
 * amenaza permanente.
 */
export function expectedAttacks(
  rival: RivalProfile,
  leagueMeanRatePerDay: number,
  observedDays: number,
  horizonDays: number,
): number {
  const priorAttacks = leagueMeanRatePerDay * PRIOR_DAYS;
  const rate =
    (rival.clauseAttacks + priorAttacks) / (Math.max(1, observedDays) + PRIOR_DAYS);
  return rate * horizonDays;
}

/**
 * Cuánto le interesa el jugador a ESE rival: solo cuenta si mejora lo que ya
 * tiene en esa posición. A quien ya tiene al mejor delantero de la liga no le
 * interesa el tuyo, por bueno que sea.
 */
export function attractivenessFor(
  rival: RivalProfile,
  player: ThreatenedPlayer,
): number {
  const best = rival.bestValueByPosition.get(player.positionId) ?? 0;
  if (best <= 0) return 1; // No tiene nada en esa posición: le sirve seguro.

  const ratio = player.marketValue / best;
  // Por debajo de 0,8 no es mejora; a partir de 1,4 es una mejora clara.
  return clamp01((ratio - 0.8) / 0.6);
}

/**
 * Si la cláusula es una ganga.
 *
 * El techo no es un número inventado: sale de lo que esta liga paga de verdad
 * por encima del valor de mercado (`priors.bidHigh`, aprendido del feed). Una
 * cláusula por encima de eso no la paga nadie, porque preferirían pujar por él
 * en el mercado.
 */
export function bargainFactor(
  player: ThreatenedPlayer,
  priors: AmountPriors,
): number {
  const floor = player.marketValue * priors.bidLow;
  const ceiling = player.marketValue * priors.bidHigh;
  if (ceiling <= floor) return player.buyoutClause <= floor ? 1 : 0;
  return clamp01((ceiling - player.buyoutClause) / (ceiling - floor));
}

export function computeExposure(
  player: ThreatenedPlayer,
  rivals: RivalProfile[],
  options: ExposureOptions,
): ExposureResult {
  const now = options.now ?? new Date();

  if (player.clauseLockedUntil && player.clauseLockedUntil > now) {
    return {
      playerId: player.playerId,
      probability: 0,
      totalLambda: 0,
      threats: [],
      note: `Cláusula bloqueada hasta ${player.clauseLockedUntil.toLocaleString("es-ES")}.`,
    };
  }

  const totalAttacks = rivals.reduce((acc, r) => acc + r.clauseAttacks, 0);
  const leagueMeanRatePerDay =
    rivals.length > 0
      ? totalAttacks / rivals.length / Math.max(1, options.observedDays)
      : 0;

  const threats: RivalThreat[] = [];
  let totalLambda = 0;

  for (const rival of rivals) {
    const attacks = expectedAttacks(
      rival,
      leagueMeanRatePerDay,
      options.observedDays,
      options.horizonDays,
    );
    const afford = probabilityCanAfford(rival.cash, player.buyoutClause);
    const attractiveness = attractivenessFor(rival, player);
    const bargain = bargainFactor(player, options.priors);
    const lambda = attacks * afford * attractiveness * bargain;

    totalLambda += lambda;
    threats.push({
      managerId: rival.managerId,
      lambda,
      expectedAttacks: attacks,
      probabilityCanAfford: afford,
      attractiveness,
      bargain,
    });
  }

  threats.sort((a, b) => b.lambda - a.lambda);

  return {
    playerId: player.playerId,
    probability: 1 - Math.exp(-totalLambda),
    totalLambda,
    threats,
    note:
      totalLambda === 0 && rivals.length > 0
        ? "Nadie puede o quiere pagar esa cláusula en este horizonte."
        : null,
  };
}

/**
 * Riesgo con la cláusula cambiada, sin recalcular nada más. Es lo que permite
 * responder "¿cuánto baja el riesgo si blindo X?" barriendo valores.
 */
export function exposureAtClause(
  player: ThreatenedPlayer,
  rivals: RivalProfile[],
  options: ExposureOptions,
  newClause: number,
): number {
  return computeExposure({ ...player, buyoutClause: newClause }, rivals, options)
    .probability;
}
