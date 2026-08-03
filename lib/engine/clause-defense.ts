import {
  computeExposure,
  exposureAtClause,
  type ExposureOptions,
  type RivalProfile,
  type ThreatenedPlayer,
} from "./exposure";
import type { ShieldingRules } from "./rules";

/**
 * Blindaje: a quién, cuánto y —sobre todo— a quién NO.
 *
 * La idea que le da la vuelta al problema:
 *
 * > Si tu cláusula ya está por encima de lo que el jugador vale para ti, que
 * > te lo clausulen es un buen negocio. No hay que blindar: hay que desearlo.
 *
 * Por eso lo primero que hace el motor es descartar a todo el que ya está
 * "sobrepagado" por su cláusula. Blindar a esos jugadores es tirar dinero dos
 * veces: pagas por retener a alguien que preferirías vender a ese precio.
 *
 *     E[beneficio de blindar Δ] = (V_yo − C) · [ p(C) − p(C + k·Δ) ] − Δ
 *
 * `k` es el multiplicador con el que el juego sube la cláusula por euro
 * invertido. Está sin confirmar (regla nº 1 de docs/reglas.md) y por eso llega
 * como parámetro obligatorio: sin él este motor no se ejecuta.
 */

export interface DefendablePlayer extends ThreatenedPlayer {
  name: string;
  /**
   * Lo que el jugador vale PARA TI, en euros.
   *
   * En la fase 1 se usa el valor de mercado como aproximación provisional.
   * En la fase 2 pasa a ser puntos esperados convertidos a euros, que es lo
   * correcto: un jugador puede valer mucho en el mercado y poco en tu once.
   */
  ownValuation: number;
}

export type ShieldVerdict =
  | "shield"
  | "no-need"
  | "let-them-take-him"
  | "not-worth-it";

export interface ShieldRecommendation {
  playerId: string;
  name: string;
  currentClause: number;
  ownValuation: number;
  currentRisk: number;
  /** Euros a invertir en blindar. null = no blindar. */
  investment: number | null;
  newClause: number | null;
  newRisk: number | null;
  /** Beneficio esperado de la inversión recomendada, en euros. */
  expectedGain: number;
  /** Euros invertidos por punto porcentual de riesgo evitado. */
  costPerRiskAvoided: number | null;
  verdict: ShieldVerdict;
  reason: string;
}

export interface ShieldOptions extends ExposureOptions {
  rules: ShieldingRules;
  /** Tope de inversión a explorar por jugador. */
  maxInvestment?: number;
  /** Pasos de la búsqueda en rejilla. */
  steps?: number;
}

export function recommendShield(
  player: DefendablePlayer,
  rivals: RivalProfile[],
  options: ShieldOptions,
): ShieldRecommendation {
  const exposure = computeExposure(player, rivals, options);
  const currentRisk = exposure.probability;

  const base = {
    playerId: player.playerId,
    name: player.name,
    currentClause: player.buyoutClause,
    ownValuation: player.ownValuation,
    currentRisk,
    investment: null,
    newClause: null,
    newRisk: null,
    costPerRiskAvoided: null,
  };

  // El caso que casi nadie considera: la cláusula ya supera lo que vale para
  // ti, así que perderlo es cobrar de más.
  const surplusIfTaken = player.buyoutClause - player.ownValuation;
  if (surplusIfTaken >= 0) {
    return {
      ...base,
      expectedGain: 0,
      verdict: "let-them-take-him",
      reason:
        `Su cláusula (${money(player.buyoutClause)}) ya supera lo que vale para ti ` +
        `(${money(player.ownValuation)}). Si te lo clausulan ganas ${money(surplusIfTaken)}. ` +
        "No blindes: interesa que pase.",
    };
  }

  if (currentRisk <= 0) {
    return {
      ...base,
      expectedGain: 0,
      verdict: "no-need",
      reason: exposure.note ?? "Riesgo nulo en este horizonte.",
    };
  }

  const lossIfTaken = player.ownValuation - player.buyoutClause;
  const maxInvestment =
    options.maxInvestment ?? Math.max(lossIfTaken, player.marketValue);
  const steps = options.steps ?? 60;

  let bestInvestment = 0;
  let bestGain = 0;
  let bestRisk = currentRisk;

  for (let i = 1; i <= steps; i++) {
    const investment = (maxInvestment * i) / steps;
    const newClause =
      player.buyoutClause + investment * options.rules.clauseMultiplier;
    const newRisk = exposureAtClause(player, rivals, options, newClause);
    const gain = lossIfTaken * (currentRisk - newRisk) - investment;

    if (gain > bestGain) {
      bestGain = gain;
      bestInvestment = investment;
      bestRisk = newRisk;
    }
  }

  if (bestInvestment === 0) {
    return {
      ...base,
      expectedGain: 0,
      verdict: "not-worth-it",
      reason:
        `Riesgo del ${pct(currentRisk)}, pero blindar cuesta más de lo que ` +
        `evita: perderlo te costaría ${money(lossIfTaken)}. Mejor ese dinero en otra cosa.`,
    };
  }

  const riskAvoided = currentRisk - bestRisk;

  return {
    ...base,
    investment: bestInvestment,
    newClause:
      player.buyoutClause + bestInvestment * options.rules.clauseMultiplier,
    newRisk: bestRisk,
    expectedGain: bestGain,
    costPerRiskAvoided: riskAvoided > 0 ? bestInvestment / (riskAvoided * 100) : null,
    verdict: "shield",
    reason:
      `Invierte ${money(bestInvestment)}: el riesgo baja del ${pct(currentRisk)} ` +
      `al ${pct(bestRisk)} y el beneficio esperado es ${money(bestGain)}.`,
  };
}

/**
 * Plan de blindaje para toda la plantilla con la caja disponible.
 *
 * Se ordena por beneficio esperado por euro, no por beneficio absoluto: con
 * presupuesto limitado, lo que maximiza el resultado es la rentabilidad de
 * cada euro, no el tamaño de cada operación.
 */
export interface ShieldPlan {
  actions: ShieldRecommendation[];
  skipped: ShieldRecommendation[];
  totalInvestment: number;
  totalExpectedGain: number;
  remainingCash: number;
}

export function planShielding(
  recommendations: ShieldRecommendation[],
  availableCash: number,
): ShieldPlan {
  const candidates = recommendations
    .filter((r) => r.verdict === "shield" && r.investment !== null)
    .sort(
      (a, b) =>
        b.expectedGain / (b.investment ?? 1) -
        a.expectedGain / (a.investment ?? 1),
    );

  const actions: ShieldRecommendation[] = [];
  const skipped: ShieldRecommendation[] = [];
  let cash = availableCash;
  let totalInvestment = 0;
  let totalExpectedGain = 0;

  for (const candidate of candidates) {
    const investment = candidate.investment!;
    if (investment <= cash) {
      actions.push(candidate);
      cash -= investment;
      totalInvestment += investment;
      totalExpectedGain += candidate.expectedGain;
    } else {
      skipped.push({
        ...candidate,
        reason: `${candidate.reason} Sin caja suficiente ahora mismo.`,
      });
    }
  }

  return {
    actions,
    skipped,
    totalInvestment,
    totalExpectedGain,
    remainingCash: cash,
  };
}

function money(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
