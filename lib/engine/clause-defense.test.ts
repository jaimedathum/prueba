import { describe, expect, it } from "vitest";
import type { AmountPriors, CashBand } from "./budget";
import type { RivalProfile } from "./exposure";
import {
  planShielding,
  recommendShield,
  type DefendablePlayer,
  type ShieldOptions,
  type ShieldRecommendation,
} from "./clause-defense";

const priors: AmountPriors = {
  bidLow: 1,
  bidTypical: 1.2,
  bidHigh: 2.5,
  largeTransaction: 30_000_000,
  samples: 50,
};

const options: ShieldOptions = {
  observedDays: 60,
  horizonDays: 14,
  priors,
  rules: { clauseMultiplier: 2 },
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

const amenazante: RivalProfile = {
  managerId: "rival",
  cash: cash(60_000_000, 80_000_000),
  clauseAttacks: 12,
  bestValueByPosition: new Map(),
};

/**
 * Un intocable: cláusula apenas por encima del valor de mercado y muy por
 * debajo de lo que vale para ti. Blindar solo sale a cuenta en este perfil,
 * y el motor lo demuestra rechazando los demás.
 */
function player(overrides: Partial<DefendablePlayer> = {}): DefendablePlayer {
  return {
    playerId: "P1",
    name: "Jugador",
    positionId: 4,
    marketValue: 20_000_000,
    buyoutClause: 22_000_000,
    ownValuation: 70_000_000,
    ...overrides,
  };
}

describe("recommendShield", () => {
  it("no blinda a quien ya está sobrepagado por su cláusula", () => {
    // La idea que le da la vuelta al problema: si la cláusula supera lo que
    // vale para ti, que te lo quiten es cobrar de más.
    const result = recommendShield(
      player({ buyoutClause: 40_000_000, ownValuation: 30_000_000 }),
      [amenazante],
      options,
    );

    expect(result.verdict).toBe("let-them-take-him");
    expect(result.investment).toBeNull();
    expect(result.reason).toMatch(/interesa que pase/);
  });

  it("recomienda blindar cuando el riesgo es alto y el jugador vale más que su cláusula", () => {
    const result = recommendShield(player(), [amenazante], options);

    expect(result.verdict).toBe("shield");
    expect(result.investment).toBeGreaterThan(0);
    expect(result.newRisk!).toBeLessThan(result.currentRisk);
    expect(result.expectedGain).toBeGreaterThan(0);
  });

  it("la cláusula nueva respeta el multiplicador del juego", () => {
    const result = recommendShield(player(), [amenazante], options);

    expect(result.newClause).toBeCloseTo(
      result.currentClause + result.investment! * 2,
      5,
    );
  });

  it("con otro multiplicador cambia la recomendación", () => {
    // Es exactamente por esto que `k` no se puede inventar.
    const generoso = recommendShield(player(), [amenazante], {
      ...options,
      rules: { clauseMultiplier: 5 },
    });
    const tacaño = recommendShield(player(), [amenazante], {
      ...options,
      rules: { clauseMultiplier: 1.1 },
    });

    expect(generoso.investment!).toBeLessThan(tacaño.investment ?? Infinity);
  });

  it("no blinda si no hay riesgo", () => {
    const pobre: RivalProfile = { ...amenazante, cash: cash(0, 1_000_000) };
    const result = recommendShield(player(), [pobre], options);

    expect(result.verdict).toBe("no-need");
    expect(result.investment).toBeNull();
  });

  it("no blinda cuando cuesta más de lo que evita", () => {
    // Pérdida potencial pequeña: no compensa gastarse nada en protegerla.
    const result = recommendShield(
      player({ buyoutClause: 24_000_000, ownValuation: 24_100_000 }),
      [amenazante],
      options,
    );

    expect(result.verdict).toBe("not-worth-it");
    expect(result.expectedGain).toBe(0);
  });

  it("no blinda a quien tiene la cláusula bloqueada", () => {
    const result = recommendShield(
      player({ clauseLockedUntil: new Date("2026-03-10T00:00:00Z") }),
      [amenazante],
      options,
    );

    expect(result.verdict).toBe("no-need");
    expect(result.reason).toMatch(/bloqueada/);
  });

  it("informa del coste por punto de riesgo evitado", () => {
    const result = recommendShield(player(), [amenazante], options);

    expect(result.costPerRiskAvoided).toBeGreaterThan(0);
  });

  it("un horizonte más largo justifica blindar más", () => {
    const semana = recommendShield(player(), [amenazante], {
      ...options,
      horizonDays: 7,
    });
    const mes = recommendShield(player(), [amenazante], {
      ...options,
      horizonDays: 30,
    });

    expect(mes.currentRisk).toBeGreaterThan(semana.currentRisk);
    expect(mes.expectedGain).toBeGreaterThan(semana.expectedGain);
  });
});

describe("planShielding", () => {
  function recommendation(
    id: string,
    investment: number,
    gain: number,
  ): ShieldRecommendation {
    return {
      playerId: id,
      name: id,
      currentClause: 10_000_000,
      ownValuation: 20_000_000,
      currentRisk: 0.5,
      investment,
      newClause: 20_000_000,
      newRisk: 0.1,
      expectedGain: gain,
      costPerRiskAvoided: 1000,
      verdict: "shield",
      reason: "",
    };
  }

  it("prioriza por rentabilidad del euro, no por beneficio absoluto", () => {
    // El grande da más beneficio total pero se come toda la caja;
    // los dos eficientes juntos rinden más.
    const eficiente = recommendation("eficiente", 1_000_000, 3_000_000);
    const grande = recommendation("grande", 9_000_000, 5_000_000);

    const plan = planShielding([grande, eficiente], 10_000_000);

    expect(plan.actions[0]!.playerId).toBe("eficiente");
  });

  it("respeta la caja disponible", () => {
    const plan = planShielding(
      [
        recommendation("a", 6_000_000, 8_000_000),
        recommendation("b", 6_000_000, 7_000_000),
      ],
      10_000_000,
    );

    expect(plan.actions).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.totalInvestment).toBeLessThanOrEqual(10_000_000);
    expect(plan.remainingCash).toBe(4_000_000);
  });

  it("explica por qué se queda fuera lo que no cabe", () => {
    const plan = planShielding(
      [recommendation("caro", 50_000_000, 60_000_000)],
      1_000_000,
    );

    expect(plan.skipped[0]!.reason).toMatch(/Sin caja suficiente/);
  });

  it("ignora lo que no es recomendación de blindar", () => {
    const dejalo: ShieldRecommendation = {
      ...recommendation("dejalo", 0, 0),
      verdict: "let-them-take-him",
      investment: null,
    };

    const plan = planShielding([dejalo], 10_000_000);
    expect(plan.actions).toHaveLength(0);
    expect(plan.totalInvestment).toBe(0);
  });
});
