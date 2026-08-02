/**
 * Taxonomía del feed de actividad y su efecto sobre la caja.
 *
 * Todo el motor de presupuesto se apoya en esta tabla, así que aquí es donde
 * hay que ser explícito con lo que NO se sabe: un evento cuyo importe no
 * aparece en el feed se marca como incierto y ensancha la banda de caja en
 * vez de inventarse un número.
 */

export const ACTIVITY_EVENT_TYPES = [
  /** Compra de un jugador libre del mercado, ganando la subasta ciega. */
  "market_purchase",
  /** Venta de un jugador al mercado (no a otro manager). */
  "market_sale",
  /** Traspaso entre managers: uno paga, el otro cobra. */
  "manager_transfer",
  /** Clausulazo: quien lo ejecuta paga, el dueño anterior cobra. */
  "clause_paid",
  /** Blindaje: se paga para subir la cláusula propia. */
  "clause_raised",
  /** Premio por jornada u otra bonificación del juego. */
  "prize",
  /** Reconocido en el feed pero sin efecto conocido sobre la caja. */
  "other",
  /** No se ha sabido clasificar: se registra igual y se marca incierto. */
  "unknown",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export interface CashEffect {
  /** Positivo = entra dinero en la caja del manager; negativo = sale. */
  delta: number;
  /**
   * Falso cuando el importe no viene en el feed. El motor de presupuesto
   * trata estos casos como intervalo, no como valor puntual.
   */
  certain: boolean;
}

export interface ActivityEventLike {
  type: string;
  managerId: string | null;
  counterpartyManagerId: string | null;
  amount: number | null;
  amountCertain: boolean;
}

/**
 * Efecto de un evento sobre la caja de un manager concreto.
 *
 * Devuelve `delta: 0, certain: true` cuando el evento sencillamente no le
 * afecta, y `certain: false` cuando le afecta pero no sabemos cuánto.
 */
export function cashEffectFor(
  event: ActivityEventLike,
  managerId: string,
): CashEffect {
  const isProtagonist = event.managerId === managerId;
  const isCounterparty = event.counterpartyManagerId === managerId;

  if (!isProtagonist && !isCounterparty) {
    return { delta: 0, certain: true };
  }

  // Un evento que sí toca a este manager pero cuyo importe no conocemos:
  // se propaga la incertidumbre en vez de asumir cero.
  if (event.amount === null) {
    return { delta: 0, certain: false };
  }

  const amount = event.amount;
  const certain = event.amountCertain;

  switch (event.type as ActivityEventType) {
    case "market_purchase":
      return { delta: -amount, certain };

    case "market_sale":
      return { delta: amount, certain };

    case "manager_transfer":
    case "clause_paid":
      // El protagonista paga, la contraparte cobra.
      return { delta: isProtagonist ? -amount : amount, certain };

    case "clause_raised":
      return { delta: isProtagonist ? -amount : 0, certain };

    case "prize":
      return { delta: isProtagonist ? amount : 0, certain };

    case "other":
      return { delta: 0, certain: true };

    case "unknown":
    default:
      return { delta: 0, certain: false };
  }
}

/** Eventos de los que se aprende cuánto suele pujar cada rival por encima del valor. */
export const BID_REVEALING_TYPES: ReadonlySet<ActivityEventType> = new Set([
  "market_purchase",
]);

/**
 * Multiplicador de puja de un evento: cuánto pagó por encima del valor de
 * mercado que el jugador tenía ese día. Es la materia prima del modelo de
 * subasta. Devuelve null si falta cualquiera de los dos datos.
 */
export function bidMultiplier(event: {
  type: string;
  amount: number | null;
  marketValueAtTime: number | null;
}): number | null {
  if (!BID_REVEALING_TYPES.has(event.type as ActivityEventType)) return null;
  if (event.amount === null || event.marketValueAtTime === null) return null;
  if (event.marketValueAtTime <= 0) return null;
  return event.amount / event.marketValueAtTime;
}
