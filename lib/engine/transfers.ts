import { optimizeLineup, type Formation, type LineupCandidate } from "./lineup";

/**
 * Optimizador de fichajes.
 *
 * La pregunta no es "¿compro a X?" sino:
 *
 * > Dado mi saldo y mi plantilla, ¿qué **combinación** de ventas y compras
 * > maximiza mi resultado en las próximas H jornadas?
 *
 * Dos detalles que cambian el resultado respecto a la intuición:
 *
 * 1. Los puntos que se ganan o se pierden **no son los del jugador, son los
 *    del once**. Vender a un suplente no cuesta puntos por muy bueno que sea,
 *    y fichar un 8 teniendo ya un 7,5 en esa posición vale 0,5, no 8. Por eso
 *    cada combinación se evalúa reoptimizando la alineación entera.
 *
 * 2. De aquí sale el **precio sombra del dinero**: cuánto vale para ti un euro
 *    más de saldo. Es el número que después usa la subasta para decidir hasta
 *    dónde pujar. Si vas sobrado de caja, un euro cuesta un euro; si vas
 *    justo, cuesta más, porque gastarlo te quita una operación mejor.
 */

export interface SquadPlayer extends LineupCandidate {
  /** Lo que te darían por él ahora mismo. */
  saleValue: number;
  /** Cambio esperado de su valor de mercado en el horizonte, en euros. */
  expectedValueChange: number;
}

export interface MarketOption extends SquadPlayer {
  /** Lo que costaría hacerse con él (puja estimada o precio pedido). */
  acquisitionCost: number;
}

export interface TransferOptions {
  formations: Formation[];
  availableCash: number;
  /** Jornadas del horizonte de decisión. */
  horizonMatchdays: number;
  /** Tipo de cambio implícito de la liga: euros por punto esperado. */
  euroPerPoint: number;
  /** Peso del juego del valor de mercado frente al de los puntos. */
  valueWeight?: number;
  /** Coste fijo de mover un jugador: evita recomendar cambios cosméticos. */
  frictionPerMove?: number;
  maxSells?: number;
  maxBuys?: number;
  /** Cuántos candidatos se consideran a cada lado, por rendimiento. */
  sellCandidates?: number;
  buyCandidates?: number;
}

export interface TransferPlan {
  sell: SquadPlayer[];
  buy: MarketOption[];
  /** Caja que queda después de la operación. */
  remainingCash: number;
  deltaLineupPoints: number;
  deltaExpectedValue: number;
  /** Resultado neto en euros, que es lo que se maximiza. */
  objective: number;
  explanation: string;
}

export interface TransferResult {
  best: TransferPlan;
  alternatives: TransferPlan[];
  /**
   * Coste real de cada euro que gastes: 1 si vas sobrado, más si la caja te
   * limita. Es el multiplicador que usa la subasta.
   */
  cashCostMultiplier: number;
  /** Cuántas combinaciones se han evaluado de verdad. */
  evaluated: number;
}

const NOOP_EXPLANATION = "No hay ninguna operación que mejore lo que ya tienes.";

function lineupPoints(squad: LineupCandidate[], formations: Formation[]): number {
  return optimizeLineup(squad, formations)?.expectedPoints ?? 0;
}

function combinations<T>(items: T[], maxSize: number): T[][] {
  const result: T[][] = [[]];
  if (maxSize >= 1) {
    for (const item of items) result.push([item]);
  }
  if (maxSize >= 2) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        result.push([items[i]!, items[j]!]);
      }
    }
  }
  return result;
}

/**
 * Evalúa combinaciones de ventas y compras.
 *
 * La búsqueda es **exhaustiva sobre los candidatos considerados**, no sobre
 * todo el universo: se podan los jugadores con menos posibilidades de entrar
 * en una operación buena para que el cálculo sea instantáneo. Es una poda, no
 * un óptimo global, y conviene saberlo.
 */
export function planTransfers(
  squad: SquadPlayer[],
  market: MarketOption[],
  options: TransferOptions,
): TransferResult {
  const valueWeight = options.valueWeight ?? 1;
  const friction = options.frictionPerMove ?? 0;
  const maxSells = options.maxSells ?? 2;
  const maxBuys = options.maxBuys ?? 2;

  const baselinePoints = lineupPoints(squad, options.formations);
  const baselineValue = squad.reduce((acc, p) => acc + p.expectedValueChange, 0);

  // Poda: se venden antes los que menos aportan al once, y se compran antes
  // los que más puntos dan por euro.
  const sellPool = [...squad]
    .sort((a, b) => a.expectedPoints - b.expectedPoints)
    .slice(0, options.sellCandidates ?? 12);
  const buyPool = [...market]
    .sort(
      (a, b) =>
        b.expectedPoints / Math.max(1, b.acquisitionCost) -
        a.expectedPoints / Math.max(1, a.acquisitionCost),
    )
    .slice(0, options.buyCandidates ?? 10);

  const evaluate = (cash: number): { best: TransferPlan; all: TransferPlan[]; evaluated: number } => {
    const plans: TransferPlan[] = [];
    let evaluated = 0;

    for (const sell of combinations(sellPool, maxSells)) {
      const sellIds = new Set(sell.map((p) => p.playerId));
      const proceeds = sell.reduce((acc, p) => acc + p.saleValue, 0);
      const remainingSquad = squad.filter((p) => !sellIds.has(p.playerId));

      for (const buy of combinations(buyPool, maxBuys)) {
        if (sell.length === 0 && buy.length === 0) continue;

        const cost = buy.reduce((acc, p) => acc + p.acquisitionCost, 0);
        const remainingCash = cash + proceeds - cost;
        if (remainingCash < 0) continue;

        evaluated++;
        const newSquad = [...remainingSquad, ...buy];
        const points = lineupPoints(newSquad, options.formations);
        const value = newSquad.reduce((acc, p) => acc + p.expectedValueChange, 0);

        const deltaPoints = (points - baselinePoints) * options.horizonMatchdays;
        const deltaValue = value - baselineValue;
        const objective =
          deltaPoints * options.euroPerPoint +
          valueWeight * deltaValue -
          friction * (sell.length + buy.length);

        plans.push({
          sell,
          buy,
          remainingCash,
          deltaLineupPoints: deltaPoints,
          deltaExpectedValue: deltaValue,
          objective,
          explanation: describe(sell, buy, deltaPoints, deltaValue, objective),
        });
      }
    }

    plans.sort((a, b) => b.objective - a.objective);

    const noop: TransferPlan = {
      sell: [],
      buy: [],
      remainingCash: cash,
      deltaLineupPoints: 0,
      deltaExpectedValue: 0,
      objective: 0,
      explanation: NOOP_EXPLANATION,
    };

    // No hacer nada siempre es una opción, y muchas veces la mejor.
    const best = plans[0] && plans[0].objective > 0 ? plans[0] : noop;
    return { best, all: plans.slice(0, 5), evaluated };
  };

  const withCurrentCash = evaluate(options.availableCash);

  /**
   * Precio sombra del dinero.
   *
   * Aquí no vale derivar: el problema es combinatorio y su óptimo es una
   * función escalonada de la caja. Con 11M y una operación que cuesta 12M, un
   * euro más vale exactamente cero; el millón que falta vale muchísimo. Una
   * diferencia finita pequeña daría cero y diría que el dinero no te limita,
   * cuando es justo al revés.
   *
   * Se mide entonces el **mejor rendimiento marginal disponible en el
   * entorno**: se prueban varios incrementos y se toma la mejor tasa. Eso
   * captura "me falta poco para algo que vale mucho", que es exactamente la
   * situación en la que hay que pujar con cabeza.
   */
  const increments = [0.05, 0.1, 0.25, 0.5, 1].map((fraction) =>
    Math.max(250_000, options.availableCash * fraction),
  );

  let shadowPrice = 0;
  for (const increment of increments) {
    const withMoreCash = evaluate(options.availableCash + increment);
    const rate =
      (withMoreCash.best.objective - withCurrentCash.best.objective) / increment;
    if (rate > shadowPrice) shadowPrice = rate;
  }

  return {
    best: withCurrentCash.best,
    alternatives: withCurrentCash.all,
    cashCostMultiplier: 1 + shadowPrice,
    evaluated: withCurrentCash.evaluated,
  };
}

function describe(
  sell: SquadPlayer[],
  buy: MarketOption[],
  deltaPoints: number,
  deltaValue: number,
  objective: number,
): string {
  const partes: string[] = [];
  if (sell.length > 0) partes.push(`vende ${sell.map((p) => p.name).join(" y ")}`);
  if (buy.length > 0) partes.push(`ficha ${buy.map((p) => p.name).join(" y ")}`);

  const detalle: string[] = [];
  if (Math.abs(deltaPoints) >= 0.1) {
    detalle.push(
      `${deltaPoints > 0 ? "+" : ""}${deltaPoints.toFixed(1)} puntos en el horizonte`,
    );
  }
  if (Math.abs(deltaValue) >= 100_000) {
    detalle.push(`${deltaValue > 0 ? "+" : ""}${money(deltaValue)} de valor`);
  }

  return (
    partes.join(", ") +
    (detalle.length > 0 ? ` (${detalle.join(", ")})` : "") +
    `. Neto ${money(objective)}.`
  );
}

/**
 * Tipo de cambio implícito de la liga: cuántos euros vale un punto esperado.
 *
 * Se estima por regresión del valor de mercado sobre los puntos esperados de
 * todos los jugadores. Es empírico: sale de lo que esta liga paga de verdad,
 * no de una constante elegida a mano.
 */
export function estimateEuroPerPoint(
  players: Array<{ expectedPoints: number; marketValue: number }>,
): number | null {
  const usable = players.filter(
    (p) => p.expectedPoints > 0 && p.marketValue > 0,
  );
  if (usable.length < 10) return null;

  // Regresión por el origen: un jugador sin puntos esperados no vale nada
  // deportivamente, así que la recta debe pasar por cero.
  const numerator = usable.reduce(
    (acc, p) => acc + p.expectedPoints * p.marketValue,
    0,
  );
  const denominator = usable.reduce(
    (acc, p) => acc + p.expectedPoints ** 2,
    0,
  );
  return denominator > 0 ? numerator / denominator : null;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
