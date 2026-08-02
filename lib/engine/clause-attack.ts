import type { CashBand } from "./budget";
import {
  computeExposure,
  type ExposureOptions,
  type RivalProfile,
} from "./exposure";
import type { DefendablePlayer } from "./clause-defense";

/**
 * Clausulazos: a quién atacar y, sobre todo, cuánto te va a costar de verdad.
 *
 * El término que casi nadie considera:
 *
 * > **Cuando pagas una cláusula, le estás dando ese dinero al rival.**
 *
 * Un clausulazo de 30M le mete 30M en caja para clausularte a ti de vuelta o
 * para ganarte las pujas. El motor lo calcula de forma explícita: recalcula la
 * caja del rival tras el pago y mide **cuánto sube la exposición de tu propia
 * plantilla**. Si el agujero que abre es mayor que la ganancia, la
 * recomendación es negativa aunque el jugador esté "barato".
 *
 *     Neto = (V_yo − C) − daño_por_financiar_al_rival
 */

export interface ClauseTarget {
  playerId: string;
  name: string;
  positionId: number;
  marketValue: number;
  buyoutClause: number;
  ownerManagerId: string;
  /** Lo que vale para ti. Fase 1: valor de mercado. Fase 2: puntos esperados. */
  ownValuation: number;
  clauseLockedUntil?: Date | null;
}

export type AttackVerdict = "attack" | "too-expensive" | "no-cash" | "locked";

export interface AttackRecommendation {
  playerId: string;
  name: string;
  ownerManagerId: string;
  clause: number;
  ownValuation: number;
  /** Lo que ganas por el propio jugador: V − C. */
  directSurplus: number;
  /** Lo que te cuesta haberle dado esa caja al rival. */
  fundingHarm: number;
  netSurplus: number;
  verdict: AttackVerdict;
  reason: string;
}

export interface AttackContext {
  myCash: number;
  /** Tu plantilla, para medir cuánto sube tu exposición tras financiar al rival. */
  mySquad: DefendablePlayer[];
  rivals: RivalProfile[];
  options: ExposureOptions;
}

/**
 * Pérdida esperada total de tu plantilla: para cada jugador, la probabilidad
 * de perderlo por la cantidad que perderías si pasara. Solo cuentan aquellos
 * cuya cláusula está por debajo de lo que valen para ti; del resto, perderlos
 * es ganar dinero.
 */
export function expectedSquadLoss(
  squad: DefendablePlayer[],
  rivals: RivalProfile[],
  options: ExposureOptions,
): number {
  let total = 0;
  for (const player of squad) {
    const lossIfTaken = player.ownValuation - player.buyoutClause;
    if (lossIfTaken <= 0) continue;
    const { probability } = computeExposure(player, rivals, options);
    total += probability * lossIfTaken;
  }
  return total;
}

/** Los mismos rivales, pero con la caja de uno aumentada tras cobrar. */
function withCashInjection(
  rivals: RivalProfile[],
  managerId: string,
  amount: number,
): RivalProfile[] {
  return rivals.map((rival) =>
    rival.managerId === managerId
      ? {
          ...rival,
          cash: shiftBand(rival.cash, amount),
        }
      : rival,
  );
}

function shiftBand(band: CashBand, amount: number): CashBand {
  return {
    ...band,
    min: band.min + amount,
    max: band.max + amount,
    point: band.point + amount,
  };
}

export function evaluateAttack(
  target: ClauseTarget,
  context: AttackContext,
): AttackRecommendation {
  const now = context.options.now ?? new Date();
  const directSurplus = target.ownValuation - target.buyoutClause;

  const base = {
    playerId: target.playerId,
    name: target.name,
    ownerManagerId: target.ownerManagerId,
    clause: target.buyoutClause,
    ownValuation: target.ownValuation,
    directSurplus,
    fundingHarm: 0,
    netSurplus: directSurplus,
  };

  if (target.clauseLockedUntil && target.clauseLockedUntil > now) {
    return {
      ...base,
      netSurplus: 0,
      verdict: "locked",
      reason: `Cláusula bloqueada hasta ${target.clauseLockedUntil.toLocaleString("es-ES")}.`,
    };
  }

  if (target.buyoutClause > context.myCash) {
    return {
      ...base,
      netSurplus: 0,
      verdict: "no-cash",
      reason:
        `Su cláusula son ${money(target.buyoutClause)} y tienes ${money(context.myCash)}. ` +
        `Te faltan ${money(target.buyoutClause - context.myCash)}.`,
    };
  }

  // El coste oculto: la caja que le regalas al dueño se vuelve contra ti.
  const before = expectedSquadLoss(
    context.mySquad,
    context.rivals,
    context.options,
  );
  const after = expectedSquadLoss(
    context.mySquad,
    withCashInjection(
      context.rivals,
      target.ownerManagerId,
      target.buyoutClause,
    ),
    context.options,
  );
  const fundingHarm = Math.max(0, after - before);
  const netSurplus = directSurplus - fundingHarm;

  if (netSurplus <= 0) {
    return {
      ...base,
      fundingHarm,
      netSurplus,
      verdict: "too-expensive",
      reason:
        directSurplus <= 0
          ? `Su cláusula (${money(target.buyoutClause)}) supera lo que vale para ti (${money(target.ownValuation)}).`
          : `Ganarías ${money(directSurplus)} por el jugador, pero darle ${money(target.buyoutClause)} ` +
            `en caja a ${target.ownerManagerId} te expone ${money(fundingHarm)}. No compensa.`,
    };
  }

  return {
    ...base,
    fundingHarm,
    netSurplus,
    verdict: "attack",
    reason:
      `Ganas ${money(directSurplus)} por el jugador` +
      (fundingHarm > 0
        ? `, menos ${money(fundingHarm)} de exponerte al financiar a ${target.ownerManagerId}: ` +
          `neto ${money(netSurplus)}.`
        : `. Neto ${money(netSurplus)}.`),
  };
}

/**
 * Todos los objetivos ordenados por excedente por euro invertido: con caja
 * limitada, lo que decide no es la ganancia absoluta sino la rentabilidad.
 */
export function rankAttacks(
  targets: ClauseTarget[],
  context: AttackContext,
): AttackRecommendation[] {
  return targets
    .map((target) => evaluateAttack(target, context))
    .sort((a, b) => {
      if (a.verdict === "attack" && b.verdict !== "attack") return -1;
      if (b.verdict === "attack" && a.verdict !== "attack") return 1;
      return b.netSurplus / Math.max(1, b.clause) -
        a.netSurplus / Math.max(1, a.clause);
    });
}

function money(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
