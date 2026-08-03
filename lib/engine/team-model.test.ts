import { describe, expect, it } from "vitest";
import {
  baselineLogLikelihood,
  fitTeamModel,
  logLikelihood,
  outlookFor,
  predictMatch,
  tau,
  timeWeight,
  type MatchResult,
} from "./team-model";

const NOW = new Date("2026-03-01T00:00:00Z");

/**
 * Liga sintética con jerarquía conocida: "fuerte" marca mucho y encaja poco,
 * "flojo" al revés. Si el ajuste funciona, tiene que recuperar ese orden.
 */
function syntheticLeague(): MatchResult[] {
  const teams = ["fuerte", "medio", "flojo"];
  const goalsFor: Record<string, number> = { fuerte: 3, medio: 2, flojo: 1 };
  const goalsAgainst: Record<string, number> = { fuerte: 0, medio: 1, flojo: 2 };

  const matches: MatchResult[] = [];
  for (let round = 0; round < 12; round++) {
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue;
        matches.push({
          homeTeamId: home,
          awayTeamId: away,
          homeGoals: Math.round((goalsFor[home]! + goalsAgainst[away]!) / 2),
          awayGoals: Math.round((goalsFor[away]! + goalsAgainst[home]!) / 2),
          playedAt: new Date(NOW.getTime() - round * 7 * 24 * 3600 * 1000),
        });
      }
    }
  }
  return matches;
}

describe("timeWeight", () => {
  it("un partido de hoy pesa 1", () => {
    expect(timeWeight(NOW, NOW, 180)).toBe(1);
  });

  it("a la vida media, pesa justo la mitad", () => {
    const hace180 = new Date(NOW.getTime() - 180 * 24 * 3600 * 1000);
    expect(timeWeight(hace180, NOW, 180)).toBeCloseTo(0.5, 6);
  });

  it("lo antiguo pesa menos que lo reciente", () => {
    const viejo = new Date(NOW.getTime() - 300 * 24 * 3600 * 1000);
    const nuevo = new Date(NOW.getTime() - 10 * 24 * 3600 * 1000);
    expect(timeWeight(viejo, NOW, 180)).toBeLessThan(timeWeight(nuevo, NOW, 180));
  });
});

describe("tau", () => {
  it("solo corrige los cuatro marcadores bajos", () => {
    expect(tau(2, 1, 1.5, 1.2, 0.1)).toBe(1);
    expect(tau(3, 3, 1.5, 1.2, 0.1)).toBe(1);
    expect(tau(1, 1, 1.5, 1.2, 0.1)).not.toBe(1);
  });

  it("con rho cero no corrige nada", () => {
    for (const [x, y] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      expect(tau(x!, y!, 1.5, 1.2, 0)).toBe(1);
    }
  });
});

describe("fitTeamModel", () => {
  it("recupera la jerarquía de una liga sintética", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });

    const fuerte = model.teams.get("fuerte")!;
    const flojo = model.teams.get("flojo")!;

    // Más ataque y mejor defensa (defensa menor = encaja menos).
    expect(fuerte.attack).toBeGreaterThan(flojo.attack);
    expect(fuerte.defense).toBeLessThan(flojo.defense);
  });

  it("bate a la línea base de 'todos los equipos iguales'", () => {
    // Si no la batiera, el modelo no aportaría nada y no habría que usarlo.
    const matches = syntheticLeague();
    const model = fitTeamModel(matches, { now: NOW });

    expect(logLikelihood(model, matches)).toBeGreaterThan(
      baselineLogLikelihood(matches),
    );
  });

  it("detecta la ventaja de jugar en casa", () => {
    const matches: MatchResult[] = [];
    for (let i = 0; i < 40; i++) {
      matches.push({
        homeTeamId: i % 2 === 0 ? "a" : "b",
        awayTeamId: i % 2 === 0 ? "b" : "a",
        homeGoals: 2,
        awayGoals: 1,
        playedAt: new Date(NOW.getTime() - i * 3 * 24 * 3600 * 1000),
      });
    }

    const model = fitTeamModel(matches, { now: NOW });
    expect(model.homeAdvantage).toBeGreaterThan(0);
  });

  it("centra ataque y defensa para que los parámetros sean identificables", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });
    const ids = [...model.teams.keys()];

    const sumaAtaque = ids.reduce(
      (acc, id) => acc + model.teams.get(id)!.attack,
      0,
    );
    expect(sumaAtaque).toBeCloseTo(0, 6);
  });

  it("sin partidos devuelve un modelo marcado como no convergido", () => {
    const model = fitTeamModel([], { now: NOW });
    expect(model.converged).toBe(false);
    expect(model.matches).toBe(0);
  });

  it("con muy pocos partidos avisa de que no ha convergido", () => {
    const model = fitTeamModel(
      [
        {
          homeTeamId: "a",
          awayTeamId: "b",
          homeGoals: 1,
          awayGoals: 0,
          playedAt: NOW,
        },
      ],
      { now: NOW },
    );
    expect(model.converged).toBe(false);
  });

  it("da más peso a la forma reciente que a la antigua", () => {
    // Un equipo que era malo y ahora es bueno debe salir bueno.
    const matches: MatchResult[] = [];
    for (let i = 0; i < 20; i++) {
      // Antiguo: pierde 0-3
      matches.push({
        homeTeamId: "cambiante",
        awayTeamId: "rival",
        homeGoals: 0,
        awayGoals: 3,
        playedAt: new Date(NOW.getTime() - (300 + i) * 24 * 3600 * 1000),
      });
    }
    for (let i = 0; i < 20; i++) {
      // Reciente: gana 3-0
      matches.push({
        homeTeamId: "cambiante",
        awayTeamId: "rival",
        homeGoals: 3,
        awayGoals: 0,
        playedAt: new Date(NOW.getTime() - i * 24 * 3600 * 1000),
      });
    }

    const conMemoriaCorta = fitTeamModel(matches, { now: NOW, halfLifeDays: 30 });
    const conMemoriaLarga = fitTeamModel(matches, {
      now: NOW,
      halfLifeDays: 2000,
    });

    expect(conMemoriaCorta.teams.get("cambiante")!.attack).toBeGreaterThan(
      conMemoriaLarga.teams.get("cambiante")!.attack,
    );
  });
});

describe("predictMatch", () => {
  it("las probabilidades de resultado suman 1", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });
    const p = predictMatch(model, "fuerte", "flojo");

    expect(p.homeWin + p.draw + p.awayWin).toBeCloseTo(1, 3);
  });

  it("el fuerte gana más veces al flojo que al revés", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });

    const fuerteEnCasa = predictMatch(model, "fuerte", "flojo");
    const flojoEnCasa = predictMatch(model, "flojo", "fuerte");

    expect(fuerteEnCasa.homeWin).toBeGreaterThan(flojoEnCasa.homeWin);
  });

  it("es más fácil dejar la portería a cero contra el flojo", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });

    const contraFlojo = predictMatch(model, "medio", "flojo").homeCleanSheet;
    const contraFuerte = predictMatch(model, "medio", "fuerte").homeCleanSheet;

    // Este es el número que más pesa en los puntos de defensas y porteros.
    expect(contraFlojo).toBeGreaterThan(contraFuerte);
  });

  it("un equipo desconocido se trata como promedio en vez de reventar", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });
    const p = predictMatch(model, "recien-ascendido", "flojo");

    expect(Number.isFinite(p.expectedHomeGoals)).toBe(true);
    expect(p.homeWin + p.draw + p.awayWin).toBeCloseTo(1, 3);
  });
});

describe("outlookFor", () => {
  it("da la vuelta a la perspectiva cuando juega fuera", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });

    const enCasa = outlookFor(model, "medio", "flojo", true);
    const fuera = outlookFor(model, "medio", "flojo", false);

    expect(enCasa.expectedGoalsFor).toBeGreaterThan(fuera.expectedGoalsFor);
    expect(enCasa.isHome).toBe(true);
    expect(fuera.isHome).toBe(false);
  });

  it("goles a favor y en contra son coherentes con el partido", () => {
    const model = fitTeamModel(syntheticLeague(), { now: NOW });
    const partido = predictMatch(model, "fuerte", "flojo");
    const visto = outlookFor(model, "flojo", "fuerte", false);

    expect(visto.expectedGoalsFor).toBeCloseTo(partido.expectedAwayGoals, 6);
    expect(visto.expectedGoalsAgainst).toBeCloseTo(partido.expectedHomeGoals, 6);
  });
});
