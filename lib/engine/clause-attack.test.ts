import { describe, expect, it } from "vitest";
import type { AmountPriors, CashBand } from "./budget";
import type { RivalProfile, ExposureOptions } from "./exposure";
import type { DefendablePlayer } from "./clause-defense";
import {
  evaluateAttack,
  expectedSquadLoss,
  rankAttacks,
  type AttackContext,
  type ClauseTarget,
} from "./clause-attack";

const priors: AmountPriors = {
  bidLow: 1,
  bidTypical: 1.2,
  bidHigh: 2.5,
  largeTransaction: 30_000_000,
  samples: 50,
};

const options: ExposureOptions = {
  observedDays: 60,
  horizonDays: 14,
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

/** Rival con poca caja: por sí solo no amenaza, pero si le pagas sí. */
function rivalPobre(managerId = "victima"): RivalProfile {
  return {
    managerId,
    cash: cash(0, 20_000_000),
    clauseAttacks: 10,
    bestValueByPosition: new Map(),
  };
}

/**
 * Tu plantilla: un jugador razonablemente protegido. Con la cláusula muy por
 * debajo de lo que vale, cualquier clausulazo saldría ruinoso solo por el
 * dinero que le pones en la mano al rival — y el motor lo rechazaría todo.
 */
const miPlantilla: DefendablePlayer[] = [
  {
    playerId: "MIO",
    name: "Mi crack",
    positionId: 3,
    marketValue: 20_000_000,
    buyoutClause: 35_000_000,
    ownValuation: 45_000_000,
  },
];

function target(overrides: Partial<ClauseTarget> = {}): ClauseTarget {
  return {
    playerId: "OBJ",
    name: "Objetivo",
    positionId: 4,
    marketValue: 20_000_000,
    buyoutClause: 25_000_000,
    ownerManagerId: "victima",
    ownValuation: 45_000_000,
    ...overrides,
  };
}

function context(overrides: Partial<AttackContext> = {}): AttackContext {
  return {
    myCash: 60_000_000,
    mySquad: miPlantilla,
    rivals: [rivalPobre()],
    options,
    ...overrides,
  };
}

describe("evaluateAttack", () => {
  it("recomienda atacar cuando el jugador vale bastante más que su cláusula", () => {
    const result = evaluateAttack(target(), context());

    expect(result.verdict).toBe("attack");
    expect(result.directSurplus).toBe(20_000_000);
    expect(result.netSurplus).toBeGreaterThan(0);
  });

  it("descuenta el coste de financiar al rival", () => {
    // Le pagas 25M a un rival sin caja: pasa de no poder tocarte a poder
    // clausularte al que más te importa.
    const result = evaluateAttack(target(), context());

    expect(result.fundingHarm).toBeGreaterThan(0);
    expect(result.netSurplus).toBeLessThan(result.directSurplus);
    expect(result.reason).toMatch(/financiar/);
  });

  it("rechaza el ataque cuando el agujero que abre supera la ganancia", () => {
    // Ganancia pequeña por el jugador, pero le das caja de sobra para
    // llevarse a tu intocable.
    const result = evaluateAttack(
      target({ buyoutClause: 44_000_000, ownValuation: 45_000_000 }),
      context(),
    );

    expect(result.verdict).toBe("too-expensive");
    expect(result.reason).toMatch(/No compensa/);
  });

  it("no ataca si la cláusula supera lo que vale para ti", () => {
    const result = evaluateAttack(
      target({ buyoutClause: 50_000_000, ownValuation: 40_000_000 }),
      context(),
    );

    expect(result.verdict).toBe("too-expensive");
    expect(result.directSurplus).toBeLessThan(0);
  });

  it("avisa de cuánto falta cuando no hay caja", () => {
    const result = evaluateAttack(target(), context({ myCash: 10_000_000 }));

    expect(result.verdict).toBe("no-cash");
    expect(result.reason).toMatch(/Te faltan/);
  });

  it("respeta la cláusula bloqueada", () => {
    const result = evaluateAttack(
      target({ clauseLockedUntil: new Date("2026-03-10T00:00:00Z") }),
      context(),
    );

    expect(result.verdict).toBe("locked");
  });

  it("sin plantilla propia expuesta, financiar al rival no duele", () => {
    // El daño existe solo si tienes algo que perder.
    const result = evaluateAttack(target(), context({ mySquad: [] }));

    expect(result.fundingHarm).toBe(0);
    expect(result.netSurplus).toBe(result.directSurplus);
  });

  it("financiar a un rival que ya era rico duele menos que a uno sin caja", () => {
    // A quien ya podía clausularte, darle más no cambia gran cosa.
    const rico = {
      ...rivalPobre(),
      cash: cash(200_000_000, 220_000_000),
    };

    const contraPobre = evaluateAttack(target(), context());
    const contraRico = evaluateAttack(
      target(),
      context({ rivals: [rico] }),
    );

    expect(contraRico.fundingHarm).toBeLessThan(contraPobre.fundingHarm);
  });
});

describe("expectedSquadLoss", () => {
  it("ignora a los jugadores cuya cláusula supera lo que valen para ti", () => {
    // Perder a esos es cobrar de más, no una pérdida.
    const sobrepagado: DefendablePlayer[] = [
      {
        playerId: "X",
        name: "X",
        positionId: 3,
        marketValue: 10_000_000,
        buyoutClause: 40_000_000,
        ownValuation: 12_000_000,
      },
    ];

    const rico: RivalProfile = {
      ...rivalPobre(),
      cash: cash(100_000_000, 120_000_000),
    };

    expect(expectedSquadLoss(sobrepagado, [rico], options)).toBe(0);
  });

  it("crece con la exposición de la plantilla", () => {
    const rico: RivalProfile = {
      ...rivalPobre(),
      cash: cash(100_000_000, 120_000_000),
    };
    const pobre = rivalPobre();

    expect(expectedSquadLoss(miPlantilla, [rico], options)).toBeGreaterThan(
      expectedSquadLoss(miPlantilla, [pobre], options),
    );
  });
});

describe("rankAttacks", () => {
  it("pone primero los ataques viables", () => {
    const ranking = rankAttacks(
      [
        target({ playerId: "caro", buyoutClause: 90_000_000 }),
        target({ playerId: "bueno" }),
      ],
      context(),
    );

    expect(ranking[0]!.playerId).toBe("bueno");
    expect(ranking[0]!.verdict).toBe("attack");
  });

  it("ordena por rentabilidad del euro, no por ganancia absoluta", () => {
    const ranking = rankAttacks(
      [
        // Gana más en absoluto, pero inmoviliza mucha más caja.
        target({
          playerId: "grande",
          buyoutClause: 40_000_000,
          ownValuation: 65_000_000,
        }),
        target({
          playerId: "eficiente",
          buyoutClause: 5_000_000,
          ownValuation: 22_000_000,
        }),
      ],
      context(),
    );

    expect(ranking[0]!.playerId).toBe("eficiente");
  });
});
