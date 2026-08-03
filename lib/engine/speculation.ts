import type { PricePrediction } from "./value";

/**
 * Trading especulativo: comprar un jugador que **nunca vas a alinear**, solo
 * porque su precio va a subir.
 *
 * Es una posición financiera, no deportiva, y por eso tiene su propia
 * aritmética. Lo que responde este motor es exactamente la pregunta práctica:
 * *¿hasta qué precio me renta?*
 *
 *     b_max = max { b :  E[valor_salida] ≥ c·b + coste_de_plaza
 *                        ∧  P(r < 0) ≤ tolerancia }
 *
 * Tres cosas impiden que esto sea dinero gratis, y las tres están dentro:
 *
 * 1. **`c`, el coste real del euro.** El capital metido aquí no está
 *    disponible para pujar ni para blindar. Si vas justo de caja, la
 *    especulación tiene que rendir más que tu mejor uso alternativo del
 *    dinero, no más que cero.
 * 2. **El coste de plaza.** La plantilla tiene tope; un especulativo ocupa un
 *    hueco que podría llevar puntos.
 * 3. **La liquidez de salida.** Depende de si vender al mercado es instantáneo
 *    (regla nº 7, sin confirmar), así que se pasa como parámetro en vez de
 *    darlo por supuesto.
 */

export interface SpeculationInput {
  playerId: string;
  name: string;
  marketValue: number;
  prediction: PricePrediction;
  /** Coste real de cada euro, del optimizador de fichajes. */
  cashCostMultiplier: number;
  /**
   * Lo que rendiría esa plaza de plantilla ocupada por un jugador útil, en
   * euros y sobre el horizonte. Cero si tienes hueco de sobra.
   */
  slotCost: number;
  /** Probabilidad de pérdida que estás dispuesto a asumir. */
  lossTolerance: number;
  /**
   * Descuento por riesgo de no poder vender cuando quieras. 1 = salida
   * instantánea garantizada; menos si hay que listar y esperar pujas.
   */
  liquidityFactor: number;
  availableCash: number;
  /**
   * Si su cláusula está por encima de lo que pagas, que te lo clausulen es una
   * salida con beneficio y sin esperar.
   */
  buyoutClause?: number | null;
  clauseExitProbability?: number;
}

export type SpeculationVerdict =
  | "buy"
  | "too-risky"
  | "no-margin"
  | "no-cash"
  | "unreliable-model";

export interface SpeculationResult {
  playerId: string;
  name: string;
  /** Precio máximo al que la operación sigue teniendo sentido. */
  maxPrice: number | null;
  expectedExitValue: number;
  expectedReturn: number;
  probabilityOfLoss: number;
  verdict: SpeculationVerdict;
  reason: string;
}

export function evaluateSpeculation(
  input: SpeculationInput,
): SpeculationResult {
  const median = input.prediction.median;
  const probabilityOfLoss = input.prediction.probabilityOfLoss;

  // Salida por mercado, descontada por el riesgo de no poder vender a tiempo.
  const marketExit =
    input.marketValue * (1 + median) * input.liquidityFactor;

  // Salida por clausulazo: si alguien la paga, cobras la cláusula entera.
  const clauseExit =
    input.buyoutClause && input.clauseExitProbability
      ? input.clauseExitProbability * input.buyoutClause +
        (1 - input.clauseExitProbability) * marketExit
      : marketExit;

  const expectedExitValue = Math.max(marketExit, clauseExit);

  const base = {
    playerId: input.playerId,
    name: input.name,
    expectedExitValue,
    expectedReturn: median,
    probabilityOfLoss,
  };

  if (!input.prediction.usable) {
    return {
      ...base,
      maxPrice: null,
      verdict: "unreliable-model",
      reason:
        "El modelo de precios aún no tiene datos suficientes. Sirve para " +
        "ordenar candidatos, no para decidir cuánto dinero poner.",
    };
  }

  if (probabilityOfLoss > input.lossTolerance) {
    return {
      ...base,
      maxPrice: null,
      verdict: "too-risky",
      reason:
        `${(probabilityOfLoss * 100).toFixed(0)}% de probabilidad de perder dinero, ` +
        `por encima de tu tolerancia del ${(input.lossTolerance * 100).toFixed(0)}%.`,
    };
  }

  const maxPrice =
    (expectedExitValue - input.slotCost) / Math.max(1e-9, input.cashCostMultiplier);

  if (maxPrice <= input.marketValue) {
    return {
      ...base,
      maxPrice: null,
      verdict: "no-margin",
      reason:
        `El suelo de la puja es ${money(input.marketValue)} y por encima de ` +
        `${money(maxPrice)} ya no compensa. No hay margen.`,
    };
  }

  if (input.availableCash < input.marketValue) {
    return {
      ...base,
      maxPrice,
      verdict: "no-cash",
      reason: `Fichable hasta ${money(maxPrice)}, pero no tienes ni para el suelo.`,
    };
  }

  const p10 = input.prediction.quantiles.get(0.1);
  const p90 = input.prediction.quantiles.get(0.9);
  const rango =
    p10 !== undefined && p90 !== undefined
      ? ` (P10 ${money(input.marketValue * (1 + p10))} / P90 ${money(input.marketValue * (1 + p90))})`
      : "";

  return {
    ...base,
    maxPrice: Math.min(maxPrice, input.availableCash),
    verdict: "buy",
    reason:
      `Fichable hasta ${money(maxPrice)}. Predicción: ${money(input.marketValue * (1 + median))}` +
      `${rango}. Probabilidad de perder dinero: ${(probabilityOfLoss * 100).toFixed(0)}%.`,
  };
}

/* ------------------------------------------------------------------ *
 * Gestión de la posición
 * ------------------------------------------------------------------ */

export interface OpenPosition {
  playerId: string;
  name: string;
  /** Lo que pagaste. */
  entryPrice: number;
  currentValue: number;
  /** Objetivo que justificó la compra. */
  targetValue: number;
  prediction: PricePrediction;
  /** Aceleración del precio: negativa = el movimiento se agota. */
  acceleration: number;
  /** Excedente del mejor uso alternativo de ese dinero, en euros. */
  bestAlternativeSurplus: number;
  /** Caída máxima que aceptas antes de admitir que la tesis falló. */
  stopLossFraction: number;
}

export type ExitReason =
  | "target-reached"
  | "momentum-exhausted"
  | "stop-loss"
  | "opportunity-cost"
  | "hold";

export interface ExitDecision {
  playerId: string;
  name: string;
  action: "sell" | "hold";
  reason: ExitReason;
  message: string;
  profit: number;
}

/**
 * Comprar es la mitad; hay que decir cuándo salir. Las reglas se evalúan en
 * orden de contundencia: primero las que cierran la posición sí o sí.
 */
export function decideExit(position: OpenPosition): ExitDecision {
  const profit = position.currentValue - position.entryPrice;
  const base = { playerId: position.playerId, name: position.name, profit };

  if (position.currentValue >= position.targetValue) {
    return {
      ...base,
      action: "sell",
      reason: "target-reached",
      message: `Alcanzó el objetivo de ${money(position.targetValue)}. Vende y cierra con ${money(profit)}.`,
    };
  }

  const caida =
    (position.entryPrice - position.currentValue) / position.entryPrice;
  if (caida >= position.stopLossFraction) {
    return {
      ...base,
      action: "sell",
      reason: "stop-loss",
      message:
        `Ha caído un ${(caida * 100).toFixed(0)}% desde tu compra. La tesis falló: ` +
        "sal sin discutir.",
    };
  }

  if (position.prediction.median < 0 && position.acceleration < 0) {
    return {
      ...base,
      action: "sell",
      reason: "momentum-exhausted",
      message:
        "El movimiento se ha agotado: la predicción a corto ya es negativa y " +
        "el precio sube cada vez menos. Vende antes del giro.",
    };
  }

  if (position.bestAlternativeSurplus > Math.max(0, profit)) {
    return {
      ...base,
      action: "sell",
      reason: "opportunity-cost",
      message:
        `Hay un uso mejor para ese dinero (${money(position.bestAlternativeSurplus)} de excedente). ` +
        "Liquida aunque no haya llegado al objetivo.",
    };
  }

  return {
    ...base,
    action: "hold",
    reason: "hold",
    message: `Mantén: va ${money(profit)} y el objetivo sigue en ${money(position.targetValue)}.`,
  };
}

function money(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
