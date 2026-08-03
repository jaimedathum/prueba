/**
 * Modelo de precio de mercado.
 *
 * Sabemos por las reglas del juego que el valor lo mueve un algoritmo que mira
 * las últimas 24 horas: compras y ventas de managers, **número y valor de las
 * pujas**, y rendimiento reciente. O sea que el precio es demanda, y la
 * demanda es en buena parte observable desde el mercado y el feed.
 *
 * Dos decisiones de diseño:
 *
 * 1. Se predice el **retorno**, no el precio absoluto. Un jugador de 30M y uno
 *    de 3M no se mueven en la misma escala de euros, pero sí en porcentaje.
 *
 * 2. Se predicen **cuantiles, no la media**. Para decidir si especular no
 *    basta `E[r]`: hace falta `P(r < 0)`, la probabilidad de perder dinero.
 *    Un modelo que solo da la media no permite gestionar riesgo, y sin gestión
 *    de riesgo la especulación es apostar.
 *
 * Con pocos datos, una regresión lineal regularizada bate a modelos más
 * complejos, así que se empieza por ahí y solo se sube de complejidad si el
 * backtest lo justifica.
 */

export interface PriceObservation {
  playerId: string;
  /** Fecha del snapshot, en formato ISO corto. */
  capturedOn: string;
  marketValue: number;
  totalPoints: number | null;
  ownedCount: number | null;
  onMarket: boolean | null;
}

/** Serie temporal de un jugador, ordenada de más antigua a más reciente. */
export type PriceSeries = PriceObservation[];

export interface PriceFeatures {
  /** Variación relativa del último día. */
  momentum1: number;
  momentum3: number;
  momentum7: number;
  /**
   * Segunda derivada. Detecta el agotamiento de un movimiento antes que la
   * primera: un jugador que sigue subiendo pero cada vez menos está a punto
   * de girarse.
   */
  acceleration: number;
  /** Puntos sumados desde el snapshot anterior: el motor principal, con retardo. */
  recentPoints: number;
  /** Proporción de managers que lo tienen. Poco poseído = más recorrido. */
  ownership: number;
  /** Estar en el mercado genera pujas, y las pujas mueven el precio. */
  onMarket: number;
  /** Los baratos suben más fácil en porcentaje. */
  logValue: number;
}

export const FEATURE_NAMES: ReadonlyArray<keyof PriceFeatures> = [
  "momentum1",
  "momentum3",
  "momentum7",
  "acceleration",
  "recentPoints",
  "ownership",
  "onMarket",
  "logValue",
];

function relativeChange(series: PriceSeries, index: number, lag: number): number {
  const past = series[index - lag];
  const current = series[index];
  if (!past || !current || past.marketValue <= 0) return 0;
  return (current.marketValue - past.marketValue) / past.marketValue;
}

export function buildFeatures(
  series: PriceSeries,
  index: number,
  leagueSize: number,
): PriceFeatures | null {
  const current = series[index];
  // Hacen falta al menos 8 días de historia para las ventanas más largas.
  if (!current || index < 8 || current.marketValue <= 0) return null;

  const momentum3 = relativeChange(series, index, 3);
  const previousMomentum3 = relativeChange(series, index - 3, 3);
  const previous = series[index - 1];

  return {
    momentum1: relativeChange(series, index, 1),
    momentum3,
    momentum7: relativeChange(series, index, 7),
    acceleration: momentum3 - previousMomentum3,
    recentPoints:
      current.totalPoints !== null && previous?.totalPoints != null
        ? current.totalPoints - previous.totalPoints
        : 0,
    ownership:
      current.ownedCount !== null && leagueSize > 0
        ? current.ownedCount / leagueSize
        : 0,
    onMarket: current.onMarket ? 1 : 0,
    logValue: Math.log(current.marketValue),
  };
}

export interface TrainingSample {
  features: PriceFeatures;
  /** Retorno observado en el horizonte. */
  target: number;
  /** Fecha de las features: imprescindible para la validación temporal. */
  date: string;
}

export function buildTrainingSet(
  seriesByPlayer: Map<string, PriceSeries>,
  horizonDays: number,
  leagueSize: number,
): TrainingSample[] {
  const samples: TrainingSample[] = [];

  for (const series of seriesByPlayer.values()) {
    for (let i = 0; i + horizonDays < series.length; i++) {
      const features = buildFeatures(series, i, leagueSize);
      if (!features) continue;

      const now = series[i]!;
      const future = series[i + horizonDays]!;
      if (now.marketValue <= 0) continue;

      samples.push({
        features,
        target: (future.marketValue - now.marketValue) / now.marketValue,
        date: now.capturedOn,
      });
    }
  }

  return samples;
}

/* ------------------------------------------------------------------ *
 * Regresión cuantílica
 * ------------------------------------------------------------------ */

export interface QuantileModel {
  quantile: number;
  weights: number[];
  intercept: number;
  means: number[];
  stdDevs: number[];
  samples: number;
}

/** Pérdida pinball: la función objetivo de la regresión cuantílica. */
export function pinballLoss(
  actual: number,
  predicted: number,
  quantile: number,
): number {
  const error = actual - predicted;
  return error >= 0 ? quantile * error : (quantile - 1) * error;
}

function featureVector(features: PriceFeatures): number[] {
  return FEATURE_NAMES.map((name) => features[name]);
}

function standardize(samples: TrainingSample[]): {
  means: number[];
  stdDevs: number[];
} {
  const vectors = samples.map((s) => featureVector(s.features));
  const dimensions = FEATURE_NAMES.length;

  const means = new Array<number>(dimensions).fill(0);
  for (const vector of vectors) {
    for (let d = 0; d < dimensions; d++) means[d]! += vector[d]! / vectors.length;
  }

  const stdDevs = new Array<number>(dimensions).fill(0);
  for (const vector of vectors) {
    for (let d = 0; d < dimensions; d++) {
      stdDevs[d]! += (vector[d]! - means[d]!) ** 2 / vectors.length;
    }
  }
  for (let d = 0; d < dimensions; d++) {
    // Una feature constante tendría desviación cero y rompería la división.
    stdDevs[d] = Math.sqrt(stdDevs[d]!) || 1;
  }

  return { means, stdDevs };
}

export interface FitQuantileOptions {
  iterations?: number;
  learningRate?: number;
  /** Regularización L2: con pocos datos es lo que evita el sobreajuste. */
  l2?: number;
}

export function fitQuantileModel(
  samples: TrainingSample[],
  quantile: number,
  options: FitQuantileOptions = {},
): QuantileModel {
  const iterations = options.iterations ?? 400;
  const learningRate = options.learningRate ?? 0.05;
  const l2 = options.l2 ?? 0.01;
  const dimensions = FEATURE_NAMES.length;

  if (samples.length === 0) {
    return {
      quantile,
      weights: new Array<number>(dimensions).fill(0),
      intercept: 0,
      means: new Array<number>(dimensions).fill(0),
      stdDevs: new Array<number>(dimensions).fill(1),
      samples: 0,
    };
  }

  const { means, stdDevs } = standardize(samples);
  const scaled = samples.map((sample) => ({
    x: featureVector(sample.features).map(
      (value, d) => (value - means[d]!) / stdDevs[d]!,
    ),
    y: sample.target,
  }));

  const weights = new Array<number>(dimensions).fill(0);
  let intercept = 0;

  for (let step = 0; step < iterations; step++) {
    const gradWeights = new Array<number>(dimensions).fill(0);
    let gradIntercept = 0;

    for (const { x, y } of scaled) {
      let predicted = intercept;
      for (let d = 0; d < dimensions; d++) predicted += weights[d]! * x[d]!;

      // Subgradiente de la pérdida pinball.
      const sign = y - predicted >= 0 ? quantile : quantile - 1;
      for (let d = 0; d < dimensions; d++) gradWeights[d]! += sign * x[d]!;
      gradIntercept += sign;
    }

    for (let d = 0; d < dimensions; d++) {
      weights[d]! +=
        (learningRate * gradWeights[d]!) / scaled.length -
        learningRate * l2 * weights[d]!;
    }
    intercept += (learningRate * gradIntercept) / scaled.length;
  }

  return { quantile, weights, intercept, means, stdDevs, samples: samples.length };
}

export function predictQuantile(
  model: QuantileModel,
  features: PriceFeatures,
): number {
  const vector = featureVector(features);
  let prediction = model.intercept;
  for (let d = 0; d < vector.length; d++) {
    prediction +=
      model.weights[d]! * ((vector[d]! - model.means[d]!) / model.stdDevs[d]!);
  }
  return prediction;
}

/* ------------------------------------------------------------------ *
 * Modelo completo y su validación
 * ------------------------------------------------------------------ */

export const QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

export interface PriceModel {
  horizonDays: number;
  models: Map<number, QuantileModel>;
  samples: number;
  /** Falso mientras no haya datos suficientes para fiarse. */
  usable: boolean;
  /** Pérdida pinball media frente a la de la línea base ingenua. */
  skillVsNaive: number | null;
}

const MIN_SAMPLES = 200;

export function fitPriceModel(
  samples: TrainingSample[],
  horizonDays: number,
  options: FitQuantileOptions = {},
): PriceModel {
  const models = new Map<number, QuantileModel>();
  for (const quantile of QUANTILES) {
    models.set(quantile, fitQuantileModel(samples, quantile, options));
  }

  return {
    horizonDays,
    models,
    samples: samples.length,
    usable: samples.length >= MIN_SAMPLES,
    skillVsNaive: null,
  };
}

export interface PricePrediction {
  /** Retorno mediano esperado. */
  median: number;
  /** Retorno en cada cuantil, para poder razonar sobre el riesgo. */
  quantiles: Map<number, number>;
  /** Probabilidad de perder dinero, interpolada entre cuantiles. */
  probabilityOfLoss: number;
  usable: boolean;
}

export function predictPrice(
  model: PriceModel,
  features: PriceFeatures,
): PricePrediction {
  const quantiles = new Map<number, number>();
  for (const [quantile, sub] of model.models) {
    quantiles.set(quantile, predictQuantile(sub, features));
  }

  return {
    median: quantiles.get(0.5) ?? 0,
    quantiles,
    probabilityOfLoss: probabilityBelowZero(quantiles),
    usable: model.usable,
  };
}

/**
 * `P(r < 0)` interpolando entre los cuantiles predichos. Si todos son
 * positivos la probabilidad es baja pero nunca cero: el modelo no sabe lo
 * suficiente como para descartar una pérdida.
 */
export function probabilityBelowZero(quantiles: Map<number, number>): number {
  const points = [...quantiles.entries()].sort((a, b) => a[1] - b[1]);
  if (points.length === 0) return 0.5;

  const first = points[0]!;
  const last = points[points.length - 1]!;

  if (last[1] < 0) return 0.95;
  if (first[1] > 0) return 0.05;

  for (let i = 0; i < points.length - 1; i++) {
    const [qLow, vLow] = points[i]!;
    const [qHigh, vHigh] = points[i + 1]!;
    if (vLow <= 0 && vHigh >= 0) {
      if (vHigh === vLow) return qLow;
      const t = (0 - vLow) / (vHigh - vLow);
      return qLow + t * (qHigh - qLow);
    }
  }
  return 0.5;
}

/**
 * Validación con separación temporal estricta: se entrena con el pasado y se
 * evalúa con el futuro, nunca mezclando fechas. Mezclarlas es el error clásico
 * que infla los resultados y hace creer que un modelo funciona cuando no.
 */
export interface Validation {
  trainSamples: number;
  testSamples: number;
  modelLoss: number;
  naiveLoss: number;
  /** Mejora relativa sobre la línea base. Negativa = el modelo estorba. */
  skill: number;
  /** Cobertura observada de cada cuantil, para ver si está calibrado. */
  calibration: Map<number, number>;
}

export function validateTemporally(
  samples: TrainingSample[],
  horizonDays: number,
  trainFraction = 0.7,
  options: FitQuantileOptions = {},
): Validation | null {
  if (samples.length < 20) return null;

  const ordered = [...samples].sort((a, b) => a.date.localeCompare(b.date));
  const cut = Math.floor(ordered.length * trainFraction);
  const train = ordered.slice(0, cut);
  const test = ordered.slice(cut);

  if (train.length === 0 || test.length === 0) return null;

  const model = fitPriceModel(train, horizonDays, options);

  let modelLoss = 0;
  let naiveLoss = 0;
  const hits = new Map<number, number>(QUANTILES.map((q) => [q, 0]));

  for (const sample of test) {
    const prediction = predictPrice(model, sample.features);
    for (const quantile of QUANTILES) {
      const predicted = prediction.quantiles.get(quantile)!;
      modelLoss += pinballLoss(sample.target, predicted, quantile);
      // La línea base ingenua: "mañana vale lo mismo que hoy", o sea r = 0.
      naiveLoss += pinballLoss(sample.target, 0, quantile);
      if (sample.target <= predicted) hits.set(quantile, hits.get(quantile)! + 1);
    }
  }

  const calibration = new Map<number, number>(
    [...hits.entries()].map(([quantile, count]) => [
      quantile,
      count / test.length,
    ]),
  );

  return {
    trainSamples: train.length,
    testSamples: test.length,
    modelLoss: modelLoss / test.length,
    naiveLoss: naiveLoss / test.length,
    skill: naiveLoss > 0 ? (naiveLoss - modelLoss) / naiveLoss : 0,
    calibration,
  };
}

/* ------------------------------------------------------------------ *
 * Reserva mientras no hay datos
 * ------------------------------------------------------------------ */

/**
 * Heurística de momentum para cuando aún no hay histórico suficiente.
 *
 * Se devuelve con `usable: false` bien visible: sirve para ordenar candidatos,
 * no para decidir cuánto dinero poner. La diferencia importa.
 */
export function heuristicPrediction(features: PriceFeatures): PricePrediction {
  const drift =
    0.5 * features.momentum3 +
    0.3 * features.momentum7 +
    0.2 * features.acceleration +
    0.01 * features.recentPoints +
    (features.onMarket ? 0.005 : 0);

  const spread = 0.04;
  const quantiles = new Map<number, number>([
    [0.1, drift - 1.28 * spread],
    [0.25, drift - 0.67 * spread],
    [0.5, drift],
    [0.75, drift + 0.67 * spread],
    [0.9, drift + 1.28 * spread],
  ]);

  return {
    median: drift,
    quantiles,
    probabilityOfLoss: probabilityBelowZero(quantiles),
    usable: false,
  };
}
