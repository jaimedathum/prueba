import { describe, expect, it } from "vitest";
import {
  buildFeatures,
  buildTrainingSet,
  fitPriceModel,
  fitQuantileModel,
  heuristicPrediction,
  pinballLoss,
  predictPrice,
  probabilityBelowZero,
  validateTemporally,
  type PriceObservation,
  type PriceSeries,
  type TrainingSample,
} from "./value";

function day(index: number): string {
  const date = new Date(Date.UTC(2026, 0, 1 + index));
  return date.toISOString().slice(0, 10);
}

function series(values: number[], overrides: Partial<PriceObservation> = {}): PriceSeries {
  return values.map((marketValue, index) => ({
    playerId: "P1",
    capturedOn: day(index),
    marketValue,
    totalPoints: index,
    ownedCount: 2,
    onMarket: false,
    ...overrides,
  }));
}

describe("buildFeatures", () => {
  it("necesita historia suficiente para las ventanas largas", () => {
    const corta = series([10, 11, 12]);
    expect(buildFeatures(corta, 2, 10)).toBeNull();
  });

  it("captura el momentum de una subida sostenida", () => {
    const subiendo = series(Array.from({ length: 15 }, (_, i) => 10 + i));
    const features = buildFeatures(subiendo, 14, 10)!;

    expect(features.momentum1).toBeGreaterThan(0);
    expect(features.momentum7).toBeGreaterThan(features.momentum1);
  });

  it("la aceleración detecta que un movimiento se agota", () => {
    // Sube cada vez menos: la primera derivada sigue positiva, la segunda no.
    const frenando = series([10, 13, 16, 19, 21, 23, 25, 26, 27, 28, 28.5, 29]);
    const features = buildFeatures(frenando, 11, 10)!;

    expect(features.momentum3).toBeGreaterThan(0);
    expect(features.acceleration).toBeLessThan(0);
  });

  it("normaliza la propiedad por el tamaño de la liga", () => {
    const datos = series(Array.from({ length: 12 }, () => 10), {
      ownedCount: 5,
    });
    expect(buildFeatures(datos, 11, 10)!.ownership).toBeCloseTo(0.5, 6);
  });
});

describe("buildTrainingSet", () => {
  it("empareja cada día con su retorno futuro", () => {
    const datos = new Map([["P1", series(Array.from({ length: 20 }, (_, i) => 100 + i))]]);
    const samples = buildTrainingSet(datos, 3, 10);

    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample.target).toBeGreaterThan(0);
    }
  });

  it("no genera muestras sin futuro observado", () => {
    const datos = new Map([["P1", series(Array.from({ length: 10 }, () => 100))]]);
    // Con horizonte 7 y 10 días, solo caben muestras hasta el índice 2,
    // y las features necesitan índice >= 8.
    expect(buildTrainingSet(datos, 7, 10)).toHaveLength(0);
  });
});

describe("pinballLoss", () => {
  it("penaliza asimétricamente según el cuantil", () => {
    // Para el cuantil 0,9 quedarse corto duele mucho más que pasarse.
    const corto = pinballLoss(10, 5, 0.9);
    const pasado = pinballLoss(10, 15, 0.9);
    expect(corto).toBeGreaterThan(pasado);
  });

  it("en la mediana es simétrica", () => {
    expect(pinballLoss(10, 5, 0.5)).toBeCloseTo(pinballLoss(10, 15, 0.5), 10);
  });
});

describe("probabilityBelowZero", () => {
  it("si todos los cuantiles son positivos, la pérdida es improbable pero no imposible", () => {
    const quantiles = new Map([
      [0.1, 0.01],
      [0.5, 0.05],
      [0.9, 0.1],
    ]);
    const p = probabilityBelowZero(quantiles);
    expect(p).toBeLessThan(0.1);
    expect(p).toBeGreaterThan(0);
  });

  it("si todos son negativos, perder es casi seguro", () => {
    const quantiles = new Map([
      [0.1, -0.1],
      [0.5, -0.05],
      [0.9, -0.01],
    ]);
    expect(probabilityBelowZero(quantiles)).toBeGreaterThan(0.9);
  });

  it("interpola cuando el cero cae entre dos cuantiles", () => {
    const quantiles = new Map([
      [0.25, -0.02],
      [0.75, 0.02],
    ]);
    expect(probabilityBelowZero(quantiles)).toBeCloseTo(0.5, 2);
  });
});

/* --- Modelo ajustado ------------------------------------------------ */

/**
 * Datos sintéticos con una señal real: el retorno futuro depende del momentum
 * reciente. Si el modelo no la encuentra, no sirve para nada.
 */
function syntheticSamples(count: number): TrainingSample[] {
  const samples: TrainingSample[] = [];
  let seed = 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (let i = 0; i < count; i++) {
    const momentum3 = (rand() - 0.5) * 0.2;
    const recentPoints = Math.round(rand() * 10);
    samples.push({
      date: day(Math.floor(i / 20)),
      features: {
        momentum1: momentum3 / 3,
        momentum3,
        momentum7: momentum3 * 2,
        acceleration: (rand() - 0.5) * 0.05,
        recentPoints,
        ownership: rand(),
        onMarket: rand() > 0.5 ? 1 : 0,
        logValue: Math.log(5_000_000 + rand() * 20_000_000),
      },
      // Señal: continuación del momentum más un empujón por puntos recientes.
      target: momentum3 * 0.6 + recentPoints * 0.004 + (rand() - 0.5) * 0.02,
    });
  }
  return samples;
}

describe("fitQuantileModel", () => {
  it("los cuantiles altos predicen por encima de los bajos", () => {
    const samples = syntheticSamples(600);
    const bajo = fitQuantileModel(samples, 0.1);
    const alto = fitQuantileModel(samples, 0.9);

    expect(alto.intercept).toBeGreaterThan(bajo.intercept);
  });

  it("sin muestras devuelve un modelo neutro en vez de fallar", () => {
    const model = fitQuantileModel([], 0.5);
    expect(model.samples).toBe(0);
    expect(model.intercept).toBe(0);
  });

  it("encuentra la señal del momentum", () => {
    const model = fitQuantileModel(syntheticSamples(600), 0.5);
    const indiceMomentum3 = 1;
    expect(model.weights[indiceMomentum3]!).toBeGreaterThan(0);
  });
});

describe("fitPriceModel", () => {
  it("se marca como no usable mientras faltan datos", () => {
    const model = fitPriceModel(syntheticSamples(50), 7);
    expect(model.usable).toBe(false);
  });

  it("se vuelve usable con histórico suficiente", () => {
    const model = fitPriceModel(syntheticSamples(400), 7);
    expect(model.usable).toBe(true);
  });

  it("los cuantiles predichos van en orden creciente", () => {
    const samples = syntheticSamples(600);
    const model = fitPriceModel(samples, 7);
    const prediction = predictPrice(model, samples[0]!.features);

    const valores = [0.1, 0.25, 0.5, 0.75, 0.9].map(
      (q) => prediction.quantiles.get(q)!,
    );
    for (let i = 1; i < valores.length; i++) {
      expect(valores[i]!).toBeGreaterThanOrEqual(valores[i - 1]!);
    }
  });
});

describe("validateTemporally", () => {
  it("entrena con el pasado y evalúa con el futuro", () => {
    const validation = validateTemporally(syntheticSamples(600), 7)!;

    expect(validation.trainSamples).toBeGreaterThan(0);
    expect(validation.testSamples).toBeGreaterThan(0);
    expect(validation.trainSamples + validation.testSamples).toBe(600);
  });

  it("bate a la línea base ingenua cuando hay señal de verdad", () => {
    // Si no la batiera, el modelo no debería usarse.
    const validation = validateTemporally(syntheticSamples(600), 7)!;
    expect(validation.skill).toBeGreaterThan(0);
    expect(validation.modelLoss).toBeLessThan(validation.naiveLoss);
  });

  it("no finge habilidad cuando los datos son puro ruido", () => {
    const ruido: TrainingSample[] = syntheticSamples(600).map((sample, i) => ({
      ...sample,
      target: ((i * 37) % 100) / 5000 - 0.01,
    }));
    const validation = validateTemporally(ruido, 7)!;

    // Con ruido puro no debería sacar ventaja apreciable a la línea base.
    expect(validation.skill).toBeLessThan(0.25);
  });

  it("informa de la cobertura de cada cuantil para poder ver si calibra", () => {
    const validation = validateTemporally(syntheticSamples(800), 7)!;
    const cobertura90 = validation.calibration.get(0.9)!;

    expect(cobertura90).toBeGreaterThan(0.6);
    expect(cobertura90).toBeLessThanOrEqual(1);
  });

  it("con muy pocas muestras no valida en vez de dar un número sin sentido", () => {
    expect(validateTemporally(syntheticSamples(10), 7)).toBeNull();
  });
});

describe("heuristicPrediction", () => {
  it("se marca explícitamente como no usable", () => {
    // Sirve para ordenar candidatos, no para decidir cuánto dinero poner.
    const prediction = heuristicPrediction({
      momentum1: 0.01,
      momentum3: 0.03,
      momentum7: 0.05,
      acceleration: 0.01,
      recentPoints: 8,
      ownership: 0.2,
      onMarket: 1,
      logValue: Math.log(10_000_000),
    });

    expect(prediction.usable).toBe(false);
    expect(prediction.median).toBeGreaterThan(0);
  });

  it("un momentum negativo predice caída", () => {
    const prediction = heuristicPrediction({
      momentum1: -0.02,
      momentum3: -0.06,
      momentum7: -0.1,
      acceleration: -0.02,
      recentPoints: 0,
      ownership: 0.8,
      onMarket: 0,
      logValue: Math.log(10_000_000),
    });

    expect(prediction.median).toBeLessThan(0);
    expect(prediction.probabilityOfLoss).toBeGreaterThan(0.5);
  });
});
