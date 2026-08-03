import { probabilityCanAfford, type CashBand } from "./budget";

/**
 * Puja óptima en el mercado.
 *
 * El mercado de LaLiga Fantasy es una **subasta ciega a primer precio**: las
 * pujas son secretas, gana la más alta, en caso de empate gana la más temprana
 * y no se puede pujar por debajo del valor de mercado. Eso tiene solución
 * matemática, no hace falta estimarlo a ojo:
 *
 *     P(ganar | b) = Π_i P(puja_i < b)
 *     E[excedente](b) = P(ganar | b) · (V − c·b)
 *
 * donde `c` es el coste real de cada euro (1 si vas sobrado de caja, más si te
 * limita) y sale del optimizador de fichajes.
 *
 * La pieza que no puede tener ninguna web: **la distribución de pujas de cada
 * rival**, aprendida del feed de actividad de tu propia liga. Unos pujan
 * siempre un 5% por encima del valor y otros un 40%. Eso solo lo sabes tú,
 * porque solo tú tienes el historial de esta liga.
 */

export interface RivalBidder {
  managerId: string;
  /** Multiplicadores puja/valor observados en sus compras pasadas. */
  multipliers: number[];
  cash: CashBand;
  /**
   * Cuánto le interesa este jugador (0-1): posición que necesita, hueco en el
   * once. Un rival al que no le sirve no puja aunque pueda pagarlo.
   */
  interest: number;
}

export interface AuctionInput {
  /** Valor de mercado: el suelo de la puja, por regla del juego. */
  marketValue: number;
  /** Lo que vale para ti, en euros. */
  myValuation: number;
  /** Coste real de cada euro. 1 = caja de sobra. */
  cashCostMultiplier: number;
  rivals: RivalBidder[];
  /** Multiplicadores de toda la liga, para rivales con poco historial. */
  leagueMultipliers: number[];
  /** Tu caja: no puedes pujar más. */
  availableCash: number;
  steps?: number;
}

export interface BidPoint {
  bid: number;
  probabilityOfWinning: number;
  expectedSurplus: number;
}

export interface AuctionResult {
  optimalBid: number | null;
  probabilityOfWinning: number;
  expectedSurplus: number;
  /** Curva completa, para poder decidir "pago 2M más y subo del 55% al 80%". */
  curve: BidPoint[];
  activeRivals: string[];
  reason: string;
  /** Consejos que salen de las reglas, no de la estadística. */
  tips: string[];
}

/** Observaciones propias mínimas antes de fiarse del patrón de un rival. */
const MIN_OWN_OBSERVATIONS = 5;

/**
 * `P(multiplicador ≥ ratio)` según lo observado.
 *
 * Se mezcla el historial del rival con el de la liga entera, pesando por
 * cuántas compras suyas se han visto: con dos observaciones no se puede
 * afirmar que alguien sea conservador.
 */
export function exceedanceProbability(
  ownMultipliers: number[],
  leagueMultipliers: number[],
  ratio: number,
): number {
  const fraction = (values: number[]) =>
    values.length === 0
      ? null
      : values.filter((m) => m >= ratio).length / values.length;

  const own = fraction(ownMultipliers);
  const league = fraction(leagueMultipliers);

  if (own === null && league === null) {
    // Sin ningún dato: se asume que pujan hasta el valor de mercado y poco más.
    return ratio <= 1 ? 1 : 0.25;
  }
  if (own === null) return league!;
  if (league === null) return own;

  const weight =
    ownMultipliers.length / (ownMultipliers.length + MIN_OWN_OBSERVATIONS);
  return weight * own + (1 - weight) * league;
}

/** Probabilidad de que un rival concreto supere una puja. */
export function probabilityRivalOutbids(
  rival: RivalBidder,
  input: AuctionInput,
  bid: number,
): number {
  if (rival.interest <= 0) return 0;
  if (input.marketValue <= 0) return 0;

  const canPay = probabilityCanAfford(rival.cash, bid);
  if (canPay <= 0) return 0;

  const wouldPay = exceedanceProbability(
    rival.multipliers,
    input.leagueMultipliers,
    bid / input.marketValue,
  );

  return rival.interest * canPay * wouldPay;
}

export function probabilityOfWinning(input: AuctionInput, bid: number): number {
  let probability = 1;
  for (const rival of input.rivals) {
    probability *= 1 - probabilityRivalOutbids(rival, input, bid);
  }
  return probability;
}

export function optimalBid(input: AuctionInput): AuctionResult {
  const floor = input.marketValue;
  const activeRivals = input.rivals
    .filter((rival) => rival.interest > 0)
    .map((rival) => rival.managerId);

  const tips = [
    "Puja pronto: en caso de empate gana la puja realizada antes.",
    "Puja una cifra no redonda: un euro por encima de un número redondo gana muchos empates.",
  ];

  if (input.availableCash < floor) {
    return {
      optimalBid: null,
      probabilityOfWinning: 0,
      expectedSurplus: 0,
      curve: [],
      activeRivals,
      reason: `No llegas ni al suelo: vale ${money(floor)} y tienes ${money(input.availableCash)}.`,
      tips: [],
    };
  }

  // Por encima de este precio la operación pierde dinero aunque la ganes.
  const breakEven = input.myValuation / Math.max(1e-9, input.cashCostMultiplier);
  const ceiling = Math.min(input.availableCash, breakEven);

  if (ceiling < floor) {
    return {
      optimalBid: null,
      probabilityOfWinning: 0,
      expectedSurplus: 0,
      curve: [],
      activeRivals,
      reason:
        `No compensa: para ti vale ${money(input.myValuation)} y el suelo de la puja ` +
        `es ${money(floor)}` +
        (input.cashCostMultiplier > 1.01
          ? `, que con la caja que tienes te cuesta como ${money(floor * input.cashCostMultiplier)}.`
          : "."),
      tips: [],
    };
  }

  const steps = input.steps ?? 120;
  const curve: BidPoint[] = [];
  let best: BidPoint = { bid: floor, probabilityOfWinning: 0, expectedSurplus: -Infinity };

  for (let i = 0; i <= steps; i++) {
    const bid = floor + ((ceiling - floor) * i) / steps;
    const probability = probabilityOfWinning(input, bid);
    const surplus =
      probability * (input.myValuation - input.cashCostMultiplier * bid);

    const point = { bid, probabilityOfWinning: probability, expectedSurplus: surplus };
    curve.push(point);
    if (surplus > best.expectedSurplus) best = point;
  }

  if (best.expectedSurplus <= 0) {
    return {
      optimalBid: null,
      probabilityOfWinning: 0,
      expectedSurplus: 0,
      curve,
      activeRivals,
      reason:
        "Ninguna puja sale rentable: lo que tendrías que pagar para tener " +
        "opciones supera lo que vale para ti.",
      tips: [],
    };
  }

  return {
    optimalBid: best.bid,
    probabilityOfWinning: best.probabilityOfWinning,
    expectedSurplus: best.expectedSurplus,
    curve,
    activeRivals,
    reason:
      `Puja ${money(best.bid)}: ${(best.probabilityOfWinning * 100).toFixed(0)}% de ganarla ` +
      `y ${money(best.expectedSurplus)} de excedente esperado` +
      (activeRivals.length === 0
        ? ". Nadie más parece interesado, así que el suelo basta."
        : ` frente a ${activeRivals.length} rival${activeRivals.length > 1 ? "es" : ""} con interés.`),
    tips,
  };
}

/**
 * Cuánto más habría que pagar para alcanzar cierta probabilidad de ganar.
 * Es la lectura práctica de la curva: "por 2M más pasas del 55% al 80%".
 */
export function bidForProbability(
  result: AuctionResult,
  target: number,
): BidPoint | null {
  for (const point of result.curve) {
    if (point.probabilityOfWinning >= target) return point;
  }
  return null;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
