import { describe, expect, it } from "vitest";
import {
  combineVotes,
  matchNames,
  normalizeName,
  smoothedAccuracy,
  sourceWeight,
  type SourceAccuracy,
} from "./consensus";

const acc = (source: string, samples: number, hits: number): SourceAccuracy => ({
  source,
  samples,
  hits,
});

describe("acierto y peso de las fuentes", () => {
  it("sin datos, todas valen lo mismo", () => {
    expect(smoothedAccuracy(acc("nueva", 0, 0))).toBe(0.5);
    expect(sourceWeight(acc("nueva", 0, 0))).toBe(0);
  });

  it("no deja que una racha corta se coma a un histórico largo", () => {
    // 3 de 3 parece perfecto, pero el shrinkage lo pone en su sitio.
    const suertuda = smoothedAccuracy(acc("suertuda", 3, 3));
    const veterana = smoothedAccuracy(acc("veterana", 240, 200));
    expect(suertuda).toBeLessThan(veterana);
  });

  it("una fuente que acierta la mitad no aporta peso", () => {
    expect(sourceWeight(acc("azar", 500, 250))).toBeCloseTo(0, 5);
  });

  it("premia el acierto sostenido", () => {
    expect(sourceWeight(acc("buena", 500, 450))).toBeGreaterThan(
      sourceWeight(acc("regular", 500, 300)),
    );
  });
});

describe("combineVotes", () => {
  it("sin votos devuelve confianza 'none' en vez de un número inventado", () => {
    const result = combineVotes([], new Map());
    expect(result).toMatchObject({ sources: 0, confidence: "none" });
  });

  it("dos fuentes de acuerdo dan confianza alta", () => {
    const result = combineVotes(
      [
        { source: "a", probability: 0.9 },
        { source: "b", probability: 0.85 },
      ],
      new Map([
        ["a", acc("a", 200, 180)],
        ["b", acc("b", 200, 170)],
      ]),
    );
    expect(result.confidence).toBe("high");
    expect(result.agreement).toBeGreaterThan(0.8);
    expect(result.probability).toBeGreaterThan(0.8);
  });

  it("dos fuentes en desacuerdo bajan la confianza", () => {
    const result = combineVotes(
      [
        { source: "a", probability: 1 },
        { source: "b", probability: 0 },
      ],
      new Map([
        ["a", acc("a", 200, 180)],
        ["b", acc("b", 200, 175)],
      ]),
    );
    // El desacuerdo es información: no se esconde tras la media.
    expect(result.agreement).toBe(0);
    expect(result.confidence).toBe("medium");
  });

  it("la fuente con mejor histórico inclina el consenso", () => {
    const result = combineVotes(
      [
        { source: "fiable", probability: 1 },
        { source: "floja", probability: 0 },
      ],
      new Map([
        ["fiable", acc("fiable", 500, 460)],
        ["floja", acc("floja", 500, 260)],
      ]),
    );
    expect(result.probability).toBeGreaterThan(0.5);
  });

  it("sin acierto medido todavía, se comporta como media simple", () => {
    const result = combineVotes(
      [
        { source: "a", probability: 1 },
        { source: "b", probability: 0 },
      ],
      new Map(),
    );
    expect(result.probability).toBeCloseTo(0.5, 5);
  });

  it("una sola fuente nunca da confianza alta", () => {
    const result = combineVotes(
      [{ source: "a", probability: 1 }],
      new Map([["a", acc("a", 500, 480)]]),
    );
    expect(result.confidence).toBe("medium");
  });
});

describe("normalizeName", () => {
  it("quita tildes, puntos y mayúsculas", () => {
    expect(normalizeName("Vinícius Júnior")).toBe("vinicius junior");
    expect(normalizeName("Vini Jr.")).toBe("vini jr");
    expect(normalizeName("  N'Golo   Kanté ")).toBe("ngolo kante");
  });
});

describe("matchNames", () => {
  const known = [
    { id: "1", name: "Vinícius Júnior", nickname: "Vini Jr." },
    { id: "2", name: "Robert Lewandowski", nickname: "Lewandowski" },
    { id: "3", name: "Álvaro Morata", nickname: "Morata" },
    { id: "4", name: "Pedro González", nickname: "Pedri" },
  ];

  it("empareja por nombre y por apodo", () => {
    const result = matchNames(["Vini Jr.", "Lewandowski"], known);
    expect(result.matched.get("Vini Jr.")).toBe("1");
    expect(result.matched.get("Lewandowski")).toBe("2");
  });

  it("empareja por apellido cuando es único", () => {
    const result = matchNames(["Morata"], known);
    expect(result.matched.get("Morata")).toBe("3");
  });

  it("reporta lo que no encuentra en vez de asignarlo al azar", () => {
    // Un emparejamiento equivocado ensucia la proyección de dos jugadores;
    // uno ausente solo baja la confianza de uno.
    const result = matchNames(["Jugador Inexistente"], known);
    expect(result.matched.size).toBe(0);
    expect(result.unmatched).toContain("Jugador Inexistente");
  });

  it("marca como ambiguo lo que casa con varios", () => {
    const conDuplicados = [
      ...known,
      { id: "5", name: "Juan Morata", nickname: "Morata" },
    ];
    const result = matchNames(["Morata"], conDuplicados);
    expect(result.ambiguous).toContain("Morata");
    expect(result.matched.size).toBe(0);
  });
});
