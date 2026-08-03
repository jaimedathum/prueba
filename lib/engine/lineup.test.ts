import { describe, expect, it } from "vitest";
import { solveAssignment } from "./assignment";
import {
  bestForFormation,
  optimizeAgainstRival,
  optimizeLineup,
  samplePlayerPoints,
  seededRng,
  simulateLineup,
  type Formation,
  type LineupCandidate,
} from "./lineup";

const FORMACIONES: Formation[] = [
  { name: "4-4-2", slots: { PT: 1, DF: 4, MC: 4, DL: 2 } },
  { name: "4-3-3", slots: { PT: 1, DF: 4, MC: 3, DL: 3 } },
  { name: "3-5-2", slots: { PT: 1, DF: 3, MC: 5, DL: 2 } },
  { name: "5-3-2", slots: { PT: 1, DF: 5, MC: 3, DL: 2 } },
];

function candidate(
  playerId: string,
  positionId: number,
  expectedPoints: number,
  overrides: Partial<LineupCandidate> = {},
): LineupCandidate {
  return {
    playerId,
    name: playerId,
    positionId,
    expectedPoints,
    riskOfZero: 0,
    ...overrides,
  };
}

/** Plantilla holgada: 2 porteros, 6 defensas, 6 medios y 5 delanteros. */
function plantilla(): LineupCandidate[] {
  const squad: LineupCandidate[] = [];
  for (let i = 0; i < 2; i++) squad.push(candidate(`PT${i}`, 1, 5 - i));
  for (let i = 0; i < 6; i++) squad.push(candidate(`DF${i}`, 2, 6 - i));
  for (let i = 0; i < 6; i++) squad.push(candidate(`MC${i}`, 3, 7 - i));
  for (let i = 0; i < 5; i++) squad.push(candidate(`DL${i}`, 4, 8 - i));
  return squad;
}

describe("solveAssignment", () => {
  it("con una sola posición por jugador coge los mejores de cada una", () => {
    const result = solveAssignment({
      players: [
        { value: 10, eligiblePositions: [2] },
        { value: 4, eligiblePositions: [2] },
        { value: 7, eligiblePositions: [3] },
      ],
      slots: new Map([
        [2, 1],
        [3, 1],
      ]),
    });

    expect(result.feasible).toBe(true);
    expect(result.totalValue).toBeCloseTo(17, 6);
  });

  it("aprovecha la versatilidad mejor que elegir por posición", () => {
    // Elegir el mejor de cada posición por separado daría 10 + 6 = 16.
    // El óptimo real es poner al versátil de medio: 9 + 8 = 17.
    const result = solveAssignment({
      players: [
        { value: 10, eligiblePositions: [2] },
        { value: 9, eligiblePositions: [2] },
        { value: 8, eligiblePositions: [2, 3] },
        { value: 6, eligiblePositions: [3] },
      ],
      slots: new Map([
        [2, 1],
        [3, 1],
      ]),
    });

    expect(result.totalValue).toBeCloseTo(18, 6);
  });

  it("avisa cuando no hay jugadores suficientes", () => {
    const result = solveAssignment({
      players: [{ value: 5, eligiblePositions: [1] }],
      slots: new Map([[1, 2]]),
    });

    expect(result.feasible).toBe(false);
  });
});

describe("bestForFormation", () => {
  it("cubre exactamente los huecos de la formación", () => {
    const { starters, feasible } = bestForFormation(plantilla(), FORMACIONES[0]!);

    expect(feasible).toBe(true);
    expect(starters).toHaveLength(11);
    expect(starters.filter((p) => p.positionId === 1)).toHaveLength(1);
    expect(starters.filter((p) => p.positionId === 2)).toHaveLength(4);
    expect(starters.filter((p) => p.positionId === 3)).toHaveLength(4);
    expect(starters.filter((p) => p.positionId === 4)).toHaveLength(2);
  });

  it("elige a los mejores disponibles de cada posición", () => {
    const { starters } = bestForFormation(plantilla(), FORMACIONES[0]!);
    const nombres = starters.map((p) => p.playerId);

    expect(nombres).toContain("DL0");
    expect(nombres).toContain("DL1");
    expect(nombres).not.toContain("DL4");
  });
});

describe("optimizeLineup", () => {
  it("elige la formación que más puntos da", () => {
    // Delanteros muy fuertes: la formación con tres debería ganar.
    const squad = plantilla().map((c) =>
      c.positionId === 4 ? { ...c, expectedPoints: c.expectedPoints + 10 } : c,
    );

    const result = optimizeLineup(squad, FORMACIONES)!;
    expect(result.formation.name).toBe("4-3-3");
  });

  it("cambia de formación cuando cambia dónde está el talento", () => {
    const squad = plantilla().map((c) =>
      c.positionId === 2 ? { ...c, expectedPoints: c.expectedPoints + 10 } : c,
    );

    const result = optimizeLineup(squad, FORMACIONES)!;
    expect(result.formation.name).toBe("5-3-2");
  });

  it("dice cuánto cuesta cada desviación respecto al óptimo", () => {
    const result = optimizeLineup(plantilla(), FORMACIONES)!;

    expect(result.alternatives[0]!.cost).toBe(0);
    for (const alternative of result.alternatives.slice(1)) {
      expect(alternative.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it("el banquillo son los que no juegan", () => {
    const squad = plantilla();
    const result = optimizeLineup(squad, FORMACIONES)!;

    expect(result.starters).toHaveLength(11);
    expect(result.bench).toHaveLength(squad.length - 11);
  });

  it("agrega el riesgo de que falten titulares", () => {
    const arriesgada = plantilla().map((c) => ({ ...c, riskOfZero: 0.2 }));
    const result = optimizeLineup(arriesgada, FORMACIONES)!;

    expect(result.expectedMissing).toBeCloseTo(11 * 0.2, 6);
  });

  it("devuelve null si no se puede formar ningún once", () => {
    const result = optimizeLineup([candidate("PT0", 1, 5)], FORMACIONES);
    expect(result).toBeNull();
  });
});

describe("samplePlayerPoints", () => {
  it("quien no juega se queda a cero", () => {
    const rng = () => 0.01; // siempre por debajo del riesgo
    const seguro = candidate("X", 4, 8, { riskOfZero: 0.5 });
    expect(samplePlayerPoints(seguro, rng)).toBe(0);
  });

  it("remuestrea del histórico cuando lo hay", () => {
    const rng = seededRng(7);
    const conHistorico = candidate("X", 4, 8, {
      riskOfZero: 0,
      matchPoints: [3, 3, 3],
    });

    for (let i = 0; i < 20; i++) {
      expect(samplePlayerPoints(conHistorico, rng)).toBe(3);
    }
  });

  it("de media se acerca a los puntos esperados", () => {
    const rng = seededRng(42);
    const jugador = candidate("X", 3, 6, { riskOfZero: 0.2 });

    let total = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) total += samplePlayerPoints(jugador, rng);

    expect(total / n).toBeCloseTo(6, 0);
  });

  it("un delantero es más irregular que un portero con la misma media", () => {
    const varianza = (positionId: number) => {
      const rng = seededRng(11);
      const jugador = candidate("X", positionId, 6, { riskOfZero: 0 });
      const muestras = Array.from({ length: 5000 }, () =>
        samplePlayerPoints(jugador, rng),
      );
      const media = muestras.reduce((a, b) => a + b, 0) / muestras.length;
      return (
        muestras.reduce((acc, v) => acc + (v - media) ** 2, 0) / muestras.length
      );
    };

    expect(varianza(4)).toBeGreaterThan(varianza(1));
  });
});

describe("optimizeAgainstRival", () => {
  /**
   * Plantilla completamente predecible (cada jugador rinde siempre lo mismo)
   * más un suplente lotería: casi siempre cero, de vez en cuando un partidazo.
   *
   * Con estos números el once de máximo valor esperado suma 62 puntos clavados
   * y la lotería se queda fuera, porque su media (5,5) es menor que la del
   * delantero al que sustituiría (6). Eso permite comprobar sin ambigüedad
   * cuándo el modo rival decide meterla.
   */
  function squadConLoteria(): LineupCandidate[] {
    const squad: LineupCandidate[] = plantilla().map((c) => ({
      ...c,
      matchPoints: [c.expectedPoints],
    }));
    squad.push(
      candidate("RULETA", 4, 5.5, {
        matchPoints: [0, 0, 0, 0, 0, 0, 0, 44],
      }),
    );
    return squad;
  }

  it("con el rival por encima de lo alcanzable, mete al jugador lotería", () => {
    // El once seguro suma 62 y siempre pierde contra 80. Jugar seguro es
    // perder seguro: la única opción con alguna posibilidad es la varianza.
    const rival = new Array(2000).fill(80);
    const result = optimizeAgainstRival(squadConLoteria(), FORMACIONES, rival, {
      iterations: 4000,
      rng: seededRng(5),
    })!;

    expect(result.starters.map((p) => p.playerId)).toContain("RULETA");
    expect(result.probabilityOfWinning).toBeGreaterThan(0.05);
    // Y acepta perder media a cambio: el once resultante suma menos puntos
    // esperados que el óptimo por valor esperado.
    expect(result.expectedPoints).toBeLessThan(62);
  });

  it("con el rival por debajo, se queda con el once seguro", () => {
    // Aquí la varianza solo puede estropearlo: 62 fijos ya ganan.
    const rival = new Array(2000).fill(40);
    const result = optimizeAgainstRival(squadConLoteria(), FORMACIONES, rival, {
      iterations: 4000,
      rng: seededRng(5),
    })!;

    expect(result.starters.map((p) => p.playerId)).not.toContain("RULETA");
    expect(result.probabilityOfWinning).toBe(1);
  });

  it("contra un rival flojo, ganar es casi seguro", () => {
    const rivalFlojo = new Array(2000).fill(5);
    const result = optimizeAgainstRival(
      plantilla(),
      FORMACIONES,
      rivalFlojo,
      { iterations: 2000, rng: seededRng(3) },
    )!;

    expect(result.probabilityOfWinning).toBeGreaterThan(0.95);
  });

  it("contra un rival imbatible, la probabilidad es prácticamente nula", () => {
    const imbatible = new Array(2000).fill(500);
    const result = optimizeAgainstRival(
      plantilla(),
      FORMACIONES,
      imbatible,
      { iterations: 2000, rng: seededRng(3) },
    )!;

    expect(result.probabilityOfWinning).toBeLessThan(0.05);
  });

  it("nunca empeora respecto al once de máximo valor esperado", () => {
    // La búsqueda local parte de ahí y solo acepta mejoras.
    const rival = new Array(2000).fill(60);
    const squad = squadConLoteria();

    const base = optimizeLineup(squad, FORMACIONES)!;
    const rng = seededRng(9);
    const baseProb = (() => {
      const muestras = simulateLineup(base.starters, 2000, rng);
      return muestras.filter((v, i) => v > rival[i]!).length / 2000;
    })();

    const result = optimizeAgainstRival(squad, FORMACIONES, rival, {
      iterations: 2000,
      rng: seededRng(9),
    })!;

    expect(result.probabilityOfWinning).toBeGreaterThanOrEqual(baseProb - 0.05);
  });
});

describe("seededRng", () => {
  it("es reproducible", () => {
    const a = seededRng(123);
    const b = seededRng(123);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("produce valores en [0,1)", () => {
    const rng = seededRng(999);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
