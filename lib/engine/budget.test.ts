import { describe, expect, it } from "vitest";
import {
  boundUnknownAmount,
  calibrate,
  estimateAmountPriors,
  estimateCash,
  probabilityCanAfford,
  type BudgetEvent,
  type CashBand,
} from "./budget";

const START = 200_000_000;

function event(overrides: Partial<BudgetEvent> = {}): BudgetEvent {
  return {
    id: Math.random().toString(36).slice(2),
    occurredAt: new Date("2026-03-01T10:00:00Z"),
    type: "market_purchase",
    managerId: "rival",
    counterpartyManagerId: null,
    playerId: "P1",
    amount: 10_000_000,
    amountCertain: true,
    marketValueAtTime: 8_000_000,
    ...overrides,
  };
}

const options = { initialBudget: START };

describe("estimateCash con importes conocidos", () => {
  it("resta compras y suma ventas", () => {
    const bands = estimateCash(
      ["rival"],
      [
        event({ type: "market_purchase", amount: 10_000_000 }),
        event({ type: "market_sale", amount: 4_000_000 }),
      ],
      options,
    );

    const rival = bands.get("rival")!;
    expect(rival.point).toBe(START - 10_000_000 + 4_000_000);
    // Todo conocido: la banda es un punto.
    expect(rival.min).toBe(rival.max);
    expect(rival.confidence).toBe("high");
  });

  it("un clausulazo mueve dinero en los dos sentidos", () => {
    const clausulazo = event({
      type: "clause_paid",
      amount: 30_000_000,
      managerId: "atacante",
      counterpartyManagerId: "victima",
    });

    const bands = estimateCash(["atacante", "victima"], [clausulazo], options);

    expect(bands.get("atacante")!.point).toBe(START - 30_000_000);
    // Justo el detalle que hace peligroso clausular: financias al rival.
    expect(bands.get("victima")!.point).toBe(START + 30_000_000);
  });

  it("ignora eventos de otros managers", () => {
    const bands = estimateCash(
      ["rival"],
      [event({ managerId: "otro", amount: 50_000_000 })],
      options,
    );
    expect(bands.get("rival")!.point).toBe(START);
    expect(bands.get("rival")!.totalEvents).toBe(0);
  });

  it("nunca deja la caja en negativo", () => {
    const bands = estimateCash(
      ["rival"],
      [event({ type: "market_purchase", amount: START * 2 })],
      options,
    );
    expect(bands.get("rival")!.min).toBe(0);
  });
});

describe("estimateCash con importes desconocidos", () => {
  it("ensancha la banda en vez de asumir un importe", () => {
    const bands = estimateCash(
      ["rival"],
      [event({ amount: null, amountCertain: false })],
      options,
    );

    const rival = bands.get("rival")!;
    expect(rival.max).toBeGreaterThan(rival.min);
    expect(rival.uncertainEvents).toBe(1);
    expect(rival.confidence).not.toBe("high");
  });

  it("una compra sin importe siempre resta al menos el valor de mercado", () => {
    // Se apoya en la regla confirmada: no se puede pujar por debajo del valor.
    const bands = estimateCash(
      ["rival"],
      [
        event({
          type: "market_purchase",
          amount: null,
          amountCertain: false,
          marketValueAtTime: 8_000_000,
        }),
      ],
      options,
    );

    expect(bands.get("rival")!.max).toBeLessThanOrEqual(START - 8_000_000);
  });

  it("un evento sin clasificar ensancha en ambos sentidos: no se sabe el signo", () => {
    const bands = estimateCash(
      ["rival"],
      [
        event({
          type: "unknown",
          amount: null,
          amountCertain: false,
          marketValueAtTime: 10_000_000,
        }),
      ],
      options,
    );

    const rival = bands.get("rival")!;
    expect(rival.min).toBeLessThan(START);
    expect(rival.max).toBeGreaterThan(START);
  });

  it("la incertidumbre se acumula con cada evento desconocido", () => {
    const desconocido = () =>
      event({ amount: null, amountCertain: false });

    const uno = estimateCash(["rival"], [desconocido()], options).get("rival")!;
    const tres = estimateCash(
      ["rival"],
      [desconocido(), desconocido(), desconocido()],
      options,
    ).get("rival")!;

    expect(tres.max - tres.min).toBeGreaterThan(uno.max - uno.min);
  });
});

describe("estimateAmountPriors", () => {
  it("sin datos suficientes usa los valores de reserva y lo dice", () => {
    const priors = estimateAmountPriors([event()]);
    expect(priors.samples).toBeLessThan(8);
    expect(priors.bidLow).toBe(1);
  });

  it("aprende de las compras reales de la liga", () => {
    // Una liga donde todos pujan justo por encima del valor.
    const eventos = Array.from({ length: 20 }, () =>
      event({ amount: 10_400_000, marketValueAtTime: 10_000_000 }),
    );
    const priors = estimateAmountPriors(eventos);

    expect(priors.samples).toBe(20);
    expect(priors.bidTypical).toBeCloseTo(1.04, 2);
    // Nunca por debajo de 1: lo impide la regla del juego.
    expect(priors.bidLow).toBeGreaterThanOrEqual(1);
  });

  it("una liga agresiva produce cotas más altas que una conservadora", () => {
    const conservadora = Array.from({ length: 20 }, () =>
      event({ amount: 10_200_000, marketValueAtTime: 10_000_000 }),
    );
    const agresiva = Array.from({ length: 20 }, () =>
      event({ amount: 16_000_000, marketValueAtTime: 10_000_000 }),
    );

    expect(estimateAmountPriors(agresiva).bidTypical).toBeGreaterThan(
      estimateAmountPriors(conservadora).bidTypical,
    );
  });
});

describe("boundUnknownAmount", () => {
  it("sin ancla de valor de mercado, acota por el tamaño típico de la liga", () => {
    const bounds = boundUnknownAmount(
      event({ marketValueAtTime: null }),
      { bidLow: 1, bidTypical: 1.2, bidHigh: 2, largeTransaction: 20_000_000, samples: 50 },
    );
    expect(bounds.high).toBe(20_000_000);
  });

  it("una cláusula siempre está por encima del valor de mercado", () => {
    const bounds = boundUnknownAmount(
      event({ type: "clause_paid", marketValueAtTime: 10_000_000 }),
      { bidLow: 1, bidTypical: 1.2, bidHigh: 2, largeTransaction: 20_000_000, samples: 50 },
    );
    expect(bounds.low).toBeGreaterThanOrEqual(10_000_000);
  });
});

describe("calibrate", () => {
  const bands = new Map<string, CashBand>([
    [
      "yo",
      {
        managerId: "yo",
        min: 40_000_000,
        max: 60_000_000,
        point: 50_000_000,
        confidence: "medium",
        uncertainEvents: 2,
        totalEvents: 10,
      },
    ],
    [
      "rival",
      {
        managerId: "rival",
        min: 20_000_000,
        max: 40_000_000,
        point: 30_000_000,
        confidence: "medium",
        uncertainEvents: 2,
        totalEvents: 10,
      },
    ],
  ]);

  it("sustituye la estimación propia por el saldo real", () => {
    const { bands: out } = calibrate(bands, "yo", 55_000_000);
    const mine = out.get("yo")!;

    expect(mine.point).toBe(55_000_000);
    expect(mine.min).toBe(mine.max);
    expect(mine.confidence).toBe("high");
  });

  it("aplica a los rivales lo que falla en el propio", () => {
    // Si el modelo se queda 5M corto contigo, se queda corto con todos.
    const { bands: out, calibration } = calibrate(bands, "yo", 55_000_000);

    expect(calibration.residual).toBe(5_000_000);
    expect(out.get("rival")!.point).toBe(35_000_000);
  });

  it("ensancha la banda de los rivales con la magnitud del error", () => {
    // Saber que falta algo no es saber cuánto: el error se propaga como
    // incertidumbre, no solo como desplazamiento.
    const { bands: out } = calibrate(bands, "yo", 55_000_000);
    const rival = out.get("rival")!;

    expect(rival.max - rival.min).toBeGreaterThan(20_000_000);
  });

  it("si el modelo clava el saldo propio, no ensancha nada", () => {
    const { bands: out, calibration } = calibrate(bands, "yo", 50_000_000);

    expect(calibration.residual).toBe(0);
    expect(out.get("rival")!.max - out.get("rival")!.min).toBe(20_000_000);
    expect(calibration.note).toMatch(/clava/);
  });

  it("sin saldo propio visible avisa de que no ha podido calibrar", () => {
    const { calibration } = calibrate(bands, "yo", null);

    expect(calibration.applied).toBe(false);
    expect(calibration.note).toMatch(/sesgo sistemático/);
  });
});

describe("probabilityCanAfford", () => {
  const band: CashBand = {
    managerId: "rival",
    min: 10_000_000,
    max: 30_000_000,
    point: 20_000_000,
    confidence: "medium",
    uncertainEvents: 1,
    totalEvents: 5,
  };

  it("puede pagar con seguridad lo que está por debajo del mínimo", () => {
    expect(probabilityCanAfford(band, 5_000_000)).toBe(1);
  });

  it("no puede pagar lo que supera el máximo", () => {
    expect(probabilityCanAfford(band, 35_000_000)).toBe(0);
  });

  it("interpola linealmente dentro de la banda", () => {
    // Uniforme es la suposición mínima cuando solo se tienen cotas.
    expect(probabilityCanAfford(band, 20_000_000)).toBeCloseTo(0.5, 5);
    expect(probabilityCanAfford(band, 25_000_000)).toBeCloseTo(0.25, 5);
  });

  it("con banda de anchura cero se comporta como un umbral", () => {
    const exacta = { ...band, min: 20_000_000, max: 20_000_000 };
    expect(probabilityCanAfford(exacta, 15_000_000)).toBe(1);
    expect(probabilityCanAfford(exacta, 25_000_000)).toBe(0);
  });
});
