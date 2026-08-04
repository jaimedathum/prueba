import { describe, expect, it } from "vitest";
import { riskDots, riskLevel } from "./risk";

describe("riskLevel", () => {
  it("va de 1 a 6 y crece con la probabilidad", () => {
    expect(riskLevel(0).score).toBe(1);
    expect(riskLevel(1).score).toBe(6);

    const scores = [0, 0.2, 0.35, 0.5, 0.7, 0.9].map((p) => riskLevel(p).score);
    const ordenados = [...scores].sort((a, b) => a - b);
    expect(scores).toEqual(ordenados);
  });

  it("afina donde se decide y no donde da igual", () => {
    // Del 5% al 15% cambia la decisión: tiene que notarse.
    expect(riskLevel(0.05).score).not.toBe(riskLevel(0.15).score);
    // Del 80% al 95% no: en los dos casos no compras.
    expect(riskLevel(0.8).score).toBe(riskLevel(0.95).score);
  });

  it("arrastra la confianza sin tocar la puntuación", () => {
    const fiable = riskLevel(0.3, true);
    const dudoso = riskLevel(0.3, false);

    expect(dudoso.score).toBe(fiable.score);
    expect(dudoso.confident).toBe(false);
  });

  it("acota una probabilidad imposible en vez de propagarla", () => {
    // Un valor fuera de rango es un error de cálculo, no un riesgo extremo.
    expect(riskLevel(-0.5).score).toBe(1);
    expect(riskLevel(4).score).toBe(6);
    expect(riskLevel(Number.NaN).score).toBe(6);
  });

  it("etiqueta cada tramo", () => {
    expect(riskLevel(0.02).label).toBe("muy bajo");
    expect(riskLevel(0.99).label).toBe("extremo");
  });
});

describe("riskDots", () => {
  it("pinta seis posiciones siempre", () => {
    for (const score of [1, 2, 3, 4, 5, 6] as const) {
      expect(riskDots(score)).toHaveLength(6);
    }
  });

  it("rellena tantas como la puntuación", () => {
    expect(riskDots(1)).toBe("●○○○○○");
    expect(riskDots(6)).toBe("●●●●●●");
  });
});
