import { describe, expect, it } from "vitest";
import type { AmountPriors, CashBand } from "./budget";
import {
  attractivenessFor,
  bargainFactor,
  computeExposure,
  expectedAttacks,
  type ExposureOptions,
  type RivalProfile,
  type ThreatenedPlayer,
} from "./exposure";

const priors: AmountPriors = {
  bidLow: 1,
  bidTypical: 1.2,
  bidHigh: 2,
  largeTransaction: 20_000_000,
  samples: 50,
};

const options: ExposureOptions = {
  observedDays: 60,
  horizonDays: 7,
  priors,
  now: new Date("2026-03-01T00:00:00Z"),
};

function cash(min: number, max: number): CashBand {
  return {
    managerId: "r",
    min,
    max,
    point: (min + max) / 2,
    confidence: "medium",
    uncertainEvents: 1,
    totalEvents: 10,
  };
}

function rival(overrides: Partial<RivalProfile> = {}): RivalProfile {
  return {
    managerId: "rival",
    cash: cash(40_000_000, 60_000_000),
    clauseAttacks: 3,
    bestValueByPosition: new Map([[4, 5_000_000]]),
    ...overrides,
  };
}

function player(overrides: Partial<ThreatenedPlayer> = {}): ThreatenedPlayer {
  return {
    playerId: "P1",
    positionId: 4,
    marketValue: 20_000_000,
    buyoutClause: 25_000_000,
    ...overrides,
  };
}

describe("expectedAttacks", () => {
  it("suaviza hacia la media: un ataque en tres días no es una amenaza permanente", () => {
    const agresivoReciente = rival({ clauseAttacks: 1 });
    const conPocoHistorico = expectedAttacks(agresivoReciente, 0.05, 3, 7);

    const sinSuavizar = (1 / 3) * 7; // 2,33 ataques esperados en la semana
    expect(conPocoHistorico).toBeLessThan(sinSuavizar / 4);
  });

  it("un rival que ataca mucho durante mucho tiempo sí acumula amenaza", () => {
    const agresivo = expectedAttacks(rival({ clauseAttacks: 20 }), 0.05, 200, 7);
    const tranquilo = expectedAttacks(rival({ clauseAttacks: 0 }), 0.05, 200, 7);

    expect(agresivo).toBeGreaterThan(tranquilo * 3);
  });

  it("escala con el horizonte", () => {
    const semana = expectedAttacks(rival(), 0.05, 60, 7);
    const dosSemanas = expectedAttacks(rival(), 0.05, 60, 14);

    expect(dosSemanas).toBeCloseTo(semana * 2, 6);
  });
});

describe("attractivenessFor", () => {
  it("un rival sin nadie en esa posición lo quiere seguro", () => {
    const sinDelanteros = rival({ bestValueByPosition: new Map() });
    expect(attractivenessFor(sinDelanteros, player())).toBe(1);
  });

  it("a quien ya tiene algo mejor no le interesa", () => {
    // El caso Lewandowski: por bueno que sea tu delantero, no lo quiere.
    const conEstrella = rival({
      bestValueByPosition: new Map([[4, 40_000_000]]),
    });
    expect(attractivenessFor(conEstrella, player())).toBe(0);
  });

  it("le interesa cuando supone una mejora clara", () => {
    const conSuplente = rival({
      bestValueByPosition: new Map([[4, 10_000_000]]),
    });
    expect(attractivenessFor(conSuplente, player())).toBe(1);
  });

  it("una mejora marginal solo interesa a medias", () => {
    const parecido = rival({
      bestValueByPosition: new Map([[4, 20_000_000]]),
    });
    const valor = attractivenessFor(parecido, player());
    expect(valor).toBeGreaterThan(0);
    expect(valor).toBeLessThan(1);
  });

  it("mira la posición correcta", () => {
    const conDelanteroBueno = rival({
      bestValueByPosition: new Map([[4, 40_000_000]]),
    });
    // El mismo rival, para un defensa, no tiene nada que oponer.
    expect(attractivenessFor(conDelanteroBueno, player({ positionId: 2 }))).toBe(1);
  });
});

describe("bargainFactor", () => {
  it("una cláusula igual al valor de mercado es una ganga total", () => {
    expect(
      bargainFactor(player({ marketValue: 20_000_000, buyoutClause: 20_000_000 }), priors),
    ).toBe(1);
  });

  it("una cláusula por encima de lo que esta liga llega a pagar no la paga nadie", () => {
    // Techo = valor × bidHigh = 40M. Por encima, prefieren pujar en el mercado.
    expect(
      bargainFactor(player({ marketValue: 20_000_000, buyoutClause: 45_000_000 }), priors),
    ).toBe(0);
  });

  it("el techo sale de lo que paga la liga, no de un número inventado", () => {
    const ligaConservadora: AmountPriors = { ...priors, bidHigh: 1.2 };
    const ligaAgresiva: AmountPriors = { ...priors, bidHigh: 3 };
    const jugador = player({ marketValue: 20_000_000, buyoutClause: 30_000_000 });

    expect(bargainFactor(jugador, ligaConservadora)).toBe(0);
    expect(bargainFactor(jugador, ligaAgresiva)).toBeGreaterThan(0);
  });
});

describe("computeExposure", () => {
  it("nunca supera 1 aunque se acumulen muchos rivales agresivos", () => {
    // Multiplicar factores sueltos sí puede pasarse de 1; sumar intensidades
    // y pasarlas por 1−exp(−λ) no. Esa es la razón de usar Poisson.
    const muchos = Array.from({ length: 15 }, (_, i) =>
      rival({
        managerId: `r${i}`,
        clauseAttacks: 30,
        cash: cash(80_000_000, 90_000_000),
        bestValueByPosition: new Map(),
      }),
    );

    const result = computeExposure(player(), muchos, options);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(result.probability).toBeGreaterThan(0.9);
  });

  it("con una amenaza moderada la probabilidad se queda holgadamente por debajo de 1", () => {
    const result = computeExposure(player(), [rival(), rival()], options);
    expect(result.probability).toBeLessThan(0.9);
    expect(result.probability).toBeGreaterThan(0);
  });

  it("un rival que no puede pagar la cláusula no amenaza", () => {
    const pobre = rival({ cash: cash(1_000_000, 2_000_000) });
    const result = computeExposure(player(), [pobre], options);

    expect(result.probability).toBe(0);
    expect(result.note).toMatch(/Nadie puede o quiere/);
  });

  it("subir la cláusula reduce el riesgo", () => {
    const rivales = [rival()];
    const barata = computeExposure(
      player({ buyoutClause: 21_000_000 }),
      rivales,
      options,
    );
    const blindada = computeExposure(
      player({ buyoutClause: 38_000_000 }),
      rivales,
      options,
    );

    expect(blindada.probability).toBeLessThan(barata.probability);
  });

  it("ordena las amenazas de mayor a menor", () => {
    const rivales = [
      rival({ managerId: "tranquilo", clauseAttacks: 0 }),
      rival({ managerId: "agresivo", clauseAttacks: 25 }),
    ];
    const result = computeExposure(player(), rivales, options);

    expect(result.threats[0]!.managerId).toBe("agresivo");
  });

  it("una cláusula bloqueada da riesgo cero y explica por qué", () => {
    const result = computeExposure(
      player({ clauseLockedUntil: new Date("2026-03-05T00:00:00Z") }),
      [rival()],
      options,
    );

    expect(result.probability).toBe(0);
    expect(result.note).toMatch(/bloqueada/);
  });

  it("el bloqueo caducado ya no protege", () => {
    const result = computeExposure(
      player({ clauseLockedUntil: new Date("2026-02-20T00:00:00Z") }),
      [rival()],
      options,
    );

    expect(result.probability).toBeGreaterThan(0);
  });

  it("el riesgo crece con el horizonte", () => {
    const semana = computeExposure(player(), [rival()], options).probability;
    const mes = computeExposure(player(), [rival()], {
      ...options,
      horizonDays: 30,
    }).probability;

    expect(mes).toBeGreaterThan(semana);
  });

  it("la incertidumbre de la caja se propaga al riesgo", () => {
    // Un rival del que no sabemos si puede pagar amenaza menos que uno
    // del que sabemos que sí, aunque su estimación puntual sea la misma.
    const seguro = rival({ cash: cash(50_000_000, 50_000_000) });
    const incierto = rival({ cash: cash(0, 100_000_000) });

    const conSeguro = computeExposure(player(), [seguro], options).probability;
    const conIncierto = computeExposure(player(), [incierto], options).probability;

    expect(conSeguro).toBeGreaterThan(conIncierto);
  });
});
