import { cashEffectFor, type ActivityEventType } from "@/lib/domain/activity";
import { initialBudget } from "./rules";

/**
 * Caja de cada rival, reconstruida desde el feed de actividad.
 *
 * Es la pieza más diferencial del proyecto: ninguna web pública puede darte
 * esto porque ninguna conoce tu liga privada. Y es la base de todo lo demás
 * —riesgo de cláusula, clausulazos, cuánto pujar—, así que la honestidad sobre
 * lo que no se sabe importa más aquí que en ningún otro sitio.
 *
 * Por eso el resultado es una **banda** `[min, max]`, nunca un número. Cuando
 * el feed no expone un importe, la banda se ensancha en lugar de asumir un
 * valor. Una banda ancha y honesta lleva a decisiones prudentes; una cifra
 * estrecha e inventada lleva a decisiones equivocadas con confianza.
 */

export interface BudgetEvent {
  id: string;
  occurredAt: Date;
  type: string;
  managerId: string | null;
  counterpartyManagerId: string | null;
  playerId: string | null;
  amount: number | null;
  amountCertain: boolean;
  /** Valor de mercado del jugador ese día: el ancla para acotar lo desconocido. */
  marketValueAtTime: number | null;
}

export interface CashBand {
  managerId: string;
  /** Mínimo que puede tener. Es el número que importa para el riesgo. */
  min: number;
  /** Máximo que puede tener. */
  max: number;
  /** Mejor estimación puntual. */
  point: number;
  confidence: "high" | "medium" | "low";
  /** Eventos que le afectan pero cuyo importe no se conoce. */
  uncertainEvents: number;
  totalEvents: number;
}

/* ------------------------------------------------------------------ *
 * Distribución de importes observada, para acotar lo desconocido
 * ------------------------------------------------------------------ */

export interface AmountPriors {
  /** Multiplicador puja/valor: mínimo, típico y máximo observados. */
  bidLow: number;
  bidTypical: number;
  bidHigh: number;
  /** Importe grande plausible, para eventos sin ningún ancla. */
  largeTransaction: number;
  /** En cuántas observaciones reales se apoya todo esto. */
  samples: number;
}

/**
 * Valores de reserva mientras no haya histórico suficiente. El suelo de 1 no
 * es una suposición: es la regla confirmada de que no se puede pujar por
 * debajo del valor de mercado.
 */
export const FALLBACK_PRIORS: AmountPriors = {
  bidLow: 1,
  bidTypical: 1.2,
  bidHigh: 2,
  largeTransaction: 30_000_000,
  samples: 0,
};

const MIN_SAMPLES_FOR_PRIORS = 8;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * p)),
  );
  return sorted[index]!;
}

/**
 * Aprende de las compras con importe conocido cuánto se paga por encima del
 * valor en ESTA liga. Con pocos datos usa los valores de reserva, y lo dice.
 */
export function estimateAmountPriors(events: BudgetEvent[]): AmountPriors {
  const multipliers: number[] = [];
  const amounts: number[] = [];

  for (const event of events) {
    if (event.amount === null || !event.amountCertain) continue;
    amounts.push(Math.abs(event.amount));
    if (
      event.type === "market_purchase" &&
      event.marketValueAtTime &&
      event.marketValueAtTime > 0
    ) {
      multipliers.push(event.amount / event.marketValueAtTime);
    }
  }

  if (multipliers.length < MIN_SAMPLES_FOR_PRIORS) {
    return {
      ...FALLBACK_PRIORS,
      largeTransaction:
        amounts.length > 0
          ? percentile([...amounts].sort((a, b) => a - b), 0.9)
          : FALLBACK_PRIORS.largeTransaction,
      samples: multipliers.length,
    };
  }

  const sorted = [...multipliers].sort((a, b) => a - b);
  return {
    // Nunca por debajo de 1: es el suelo que impone la regla del juego.
    bidLow: Math.max(1, percentile(sorted, 0.05)),
    bidTypical: percentile(sorted, 0.5),
    bidHigh: percentile(sorted, 0.95),
    largeTransaction: percentile([...amounts].sort((a, b) => a - b), 0.9),
    samples: multipliers.length,
  };
}

/* ------------------------------------------------------------------ *
 * Acotado de un importe desconocido
 * ------------------------------------------------------------------ */

interface AmountBounds {
  low: number;
  typical: number;
  high: number;
}

/**
 * Rango plausible del importe de un evento cuando el feed no lo expone.
 * El valor de mercado del jugador ese día es el ancla; sin ella solo queda
 * acotar por el tamaño típico de una transacción grande en esta liga.
 */
export function boundUnknownAmount(
  event: BudgetEvent,
  priors: AmountPriors,
): AmountBounds {
  const anchor = event.marketValueAtTime;

  if (anchor === null || anchor <= 0) {
    return {
      low: 0,
      typical: priors.largeTransaction / 2,
      high: priors.largeTransaction,
    };
  }

  switch (event.type as ActivityEventType) {
    case "market_purchase":
      // Suelo garantizado por la regla del juego, techo por lo observado.
      return {
        low: anchor * priors.bidLow,
        typical: anchor * priors.bidTypical,
        high: anchor * priors.bidHigh,
      };

    case "market_sale":
      // Vender al mercado debería rondar el valor; el margen refleja que la
      // mecánica exacta está sin confirmar (regla nº 7).
      return { low: anchor * 0.8, typical: anchor, high: anchor * 1.2 };

    case "clause_paid":
      // Una cláusula está por encima del valor, pero cuánto depende de si el
      // dueño había blindado.
      return { low: anchor, typical: anchor * 1.5, high: anchor * 3 };

    default:
      return {
        low: 0,
        typical: anchor / 2,
        high: anchor,
      };
  }
}

/* ------------------------------------------------------------------ *
 * Estimación
 * ------------------------------------------------------------------ */

export interface EstimateOptions {
  initialBudget?: number;
  priors?: AmountPriors;
}

export function estimateCash(
  managerIds: string[],
  events: BudgetEvent[],
  options: EstimateOptions = {},
): Map<string, CashBand> {
  const start = options.initialBudget ?? initialBudget();
  const priors = options.priors ?? estimateAmountPriors(events);
  const bands = new Map<string, CashBand>();

  for (const managerId of managerIds) {
    let min = start;
    let max = start;
    let point = start;
    let uncertainEvents = 0;
    let totalEvents = 0;

    for (const event of events) {
      const effect = cashEffectFor(event, managerId);

      const touchesMe =
        event.managerId === managerId ||
        event.counterpartyManagerId === managerId;
      if (!touchesMe) continue;
      totalEvents++;

      if (effect.certain && event.amount !== null) {
        min += effect.delta;
        max += effect.delta;
        point += effect.delta;
        continue;
      }

      uncertainEvents++;
      const bounds = boundUnknownAmount(event, priors);

      // Sentido del flujo: si el evento se pudo clasificar, se conoce; si no,
      // se ensancha en ambas direcciones porque ni siquiera se sabe el signo.
      const direction = flowDirection(event, managerId);

      if (direction === "out") {
        min -= bounds.high;
        max -= bounds.low;
        point -= bounds.typical;
      } else if (direction === "in") {
        min += bounds.low;
        max += bounds.high;
        point += bounds.typical;
      } else {
        min -= bounds.high;
        max += bounds.high;
      }
    }

    // La caja no puede ser negativa: el juego no deja gastar lo que no tienes.
    min = Math.max(0, min);
    point = Math.max(0, Math.min(point, max));

    bands.set(managerId, {
      managerId,
      min,
      max,
      point,
      uncertainEvents,
      totalEvents,
      confidence: confidenceFor(max - min, start, uncertainEvents),
    });
  }

  return bands;
}

function flowDirection(
  event: BudgetEvent,
  managerId: string,
): "in" | "out" | "unknown" {
  const isProtagonist = event.managerId === managerId;

  switch (event.type as ActivityEventType) {
    case "market_purchase":
    case "clause_raised":
      return "out";
    case "market_sale":
    case "prize":
      return "in";
    case "manager_transfer":
    case "clause_paid":
      return isProtagonist ? "out" : "in";
    default:
      return "unknown";
  }
}

/**
 * Un evento sin importe conocido limita la confianza aunque la banda salga
 * estrecha: el riesgo no es solo la anchura, es que el evento se haya
 * interpretado mal. Solo se llega a "alta" cuando no queda nada por suponer.
 */
function confidenceFor(
  width: number,
  reference: number,
  uncertainEvents: number,
): CashBand["confidence"] {
  if (uncertainEvents === 0) return "high";
  const relative = width / Math.max(1, reference);
  return relative < 0.3 ? "medium" : "low";
}

/* ------------------------------------------------------------------ *
 * Calibración contra el saldo propio
 * ------------------------------------------------------------------ */

export interface CalibrationResult {
  /** Saldo real menos estimado, para el manager propio. */
  residual: number;
  /** Si se ha podido calibrar (hace falta el saldo propio visible). */
  applied: boolean;
  note: string;
}

/**
 * El test de aceptación del motor, convertido en mecanismo.
 *
 * Tu propio saldo SÍ es visible, así que se compara con el que estima el
 * modelo. El residuo mide exactamente lo que no se está modelando (premios
 * por jornada, comisiones, un presupuesto inicial distinto). Se aplica como
 * corrección a todos —el flujo no modelado afecta a todos por igual— y además
 * se ensancha la banda de todos con su magnitud: saber que falta algo no es
 * lo mismo que saber cuánto es.
 *
 * Si el modelo no clava tu saldo, no acierta el de nadie.
 */
export function calibrate(
  bands: Map<string, CashBand>,
  myManagerId: string,
  myReportedBalance: number | null,
): { bands: Map<string, CashBand>; calibration: CalibrationResult } {
  const mine = bands.get(myManagerId);

  if (myReportedBalance === null || !mine) {
    return {
      bands,
      calibration: {
        residual: 0,
        applied: false,
        note:
          "Sin saldo propio visible no hay contra qué calibrar. Las bandas " +
          "salen sin corregir y pueden tener un sesgo sistemático.",
      },
    };
  }

  const residual = myReportedBalance - mine.point;
  const widening = Math.abs(residual);

  const corrected = new Map<string, CashBand>();
  for (const [id, band] of bands) {
    if (id === myManagerId) {
      // El propio no se estima: se conoce.
      corrected.set(id, {
        ...band,
        min: myReportedBalance,
        max: myReportedBalance,
        point: myReportedBalance,
        confidence: "high",
      });
      continue;
    }
    corrected.set(id, {
      ...band,
      min: Math.max(0, band.min + residual - widening),
      max: band.max + residual + widening,
      point: Math.max(0, band.point + residual),
      confidence: confidenceFor(
        band.max - band.min + 2 * widening,
        initialBudget(),
        band.uncertainEvents,
      ),
    });
  }

  return {
    bands: corrected,
    calibration: {
      residual,
      applied: true,
      note:
        widening === 0
          ? "El modelo clava tu saldo: no hay flujos sin modelar detectables."
          : `El modelo se desvía ${widening.toLocaleString("es-ES")} € en tu saldo. ` +
            "Esa diferencia se aplica a todos y ensancha sus bandas.",
    },
  };
}

/**
 * Probabilidad de que un manager pueda pagar un importe, tratando la banda
 * como distribución uniforme. Es la suposición mínima cuando solo se tienen
 * cotas: no se inventa una forma de distribución que no se ha medido.
 */
export function probabilityCanAfford(band: CashBand, amount: number): number {
  if (amount <= band.min) return 1;
  if (amount >= band.max) return 0;
  if (band.max === band.min) return amount <= band.min ? 1 : 0;
  return (band.max - amount) / (band.max - band.min);
}
