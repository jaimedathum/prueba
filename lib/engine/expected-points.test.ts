import { describe, expect, it } from "vitest";
import type { TeamOutlook } from "./team-model";
import {
  computePositionAverages,
  expectedPoints,
  fixtureMultiplier,
  shrunkPointsPer90,
  startProbabilityFor,
  type ExpectedPointsInput,
  type LeagueContext,
  type PlayerHistory,
} from "./expected-points";

const league: LeagueContext = {
  pointsPer90ByPosition: new Map([
    [1, 3],
    [2, 3.5],
    [3, 4],
    [4, 4.5],
  ]),
  averageGoalsFor: 1.3,
  averageCleanSheetProbability: 0.3,
};

function player(overrides: Partial<PlayerHistory> = {}): PlayerHistory {
  return {
    playerId: "P1",
    name: "Jugador",
    positionId: 3,
    minutesPlayed: 900,
    fantasyPoints: 60,
    appearances: 10,
    starts: 10,
    teamMatches: 10,
    ...overrides,
  };
}

function input(overrides: Partial<ExpectedPointsInput> = {}): ExpectedPointsInput {
  return {
    player: player(),
    status: "ok",
    consensusStartProbability: 0.9,
    outlook: null,
    ...overrides,
  };
}

function outlook(overrides: Partial<TeamOutlook> = {}): TeamOutlook {
  return {
    teamId: "equipo",
    opponentId: "rival",
    isHome: true,
    expectedGoalsFor: 1.3,
    expectedGoalsAgainst: 1.3,
    cleanSheetProbability: 0.3,
    winProbability: 0.4,
    drawProbability: 0.25,
    ...overrides,
  };
}

describe("shrunkPointsPer90", () => {
  it("con muchos minutos se acerca a lo observado", () => {
    const veterano = player({ minutesPlayed: 3000, fantasyPoints: 300 });
    // 9 puntos por 90' observados frente a una media de posición de 4.
    expect(shrunkPointsPer90(veterano, 4)).toBeGreaterThan(8);
  });

  it("dos partidazos no disparan la proyección de un desconocido", () => {
    // Es el error clásico de mirar medias a pelo.
    const flash = player({ minutesPlayed: 180, fantasyPoints: 40 });
    const observado = 20;
    const suavizado = shrunkPointsPer90(flash, 4);

    expect(suavizado).toBeLessThan(observado / 2);
    expect(suavizado).toBeGreaterThan(4);
  });

  it("sin minutos devuelve la media de la posición", () => {
    expect(shrunkPointsPer90(player({ minutesPlayed: 0 }), 4)).toBe(4);
  });
});

describe("startProbabilityFor", () => {
  it("un lesionado no juega, diga lo que diga el consenso", () => {
    const result = startProbabilityFor(
      input({ status: "injured", consensusStartProbability: 0.95 }),
    );
    expect(result.probability).toBe(0);
    expect(result.source).toBe("status");
  });

  it("un sancionado tampoco", () => {
    expect(
      startProbabilityFor(input({ status: "suspended" })).probability,
    ).toBe(0);
  });

  it("una duda no se convierte ni en sí ni en no", () => {
    const result = startProbabilityFor(
      input({ status: "doubtful", consensusStartProbability: 0.8 }),
    );
    expect(result.probability).toBeCloseTo(0.4, 5);
  });

  it("sin consenso cae a la racha de titularidades", () => {
    const result = startProbabilityFor(
      input({
        consensusStartProbability: null,
        player: player({ starts: 3, teamMatches: 10 }),
      }),
    );
    expect(result.probability).toBeCloseTo(0.3, 5);
    expect(result.source).toBe("streak");
  });
});

describe("fixtureMultiplier", () => {
  it("sin partido conocido no ajusta nada", () => {
    expect(fixtureMultiplier(4, null, league)).toBe(1);
  });

  it("a un portero le importa la portería a cero, no los goles a favor", () => {
    const porteriaFacil = fixtureMultiplier(
      1,
      outlook({ cleanSheetProbability: 0.6 }),
      league,
    );
    const ataqueFacil = fixtureMultiplier(
      1,
      outlook({ expectedGoalsFor: 2.6 }),
      league,
    );

    expect(porteriaFacil).toBeGreaterThan(ataqueFacil);
  });

  it("a un delantero le importan los goles, no la portería a cero", () => {
    const porteriaFacil = fixtureMultiplier(
      4,
      outlook({ cleanSheetProbability: 0.6 }),
      league,
    );
    const ataqueFacil = fixtureMultiplier(
      4,
      outlook({ expectedGoalsFor: 2.6 }),
      league,
    );

    expect(ataqueFacil).toBeGreaterThan(porteriaFacil);
  });

  it("un partido nunca triplica ni anula a un jugador", () => {
    const brutal = fixtureMultiplier(
      4,
      outlook({ expectedGoalsFor: 10, cleanSheetProbability: 0.99 }),
      league,
    );
    const horrible = fixtureMultiplier(
      4,
      outlook({ expectedGoalsFor: 0.01, cleanSheetProbability: 0.001 }),
      league,
    );

    expect(brutal).toBeLessThanOrEqual(1.8);
    expect(horrible).toBeGreaterThanOrEqual(0.5);
  });
});

describe("expectedPoints", () => {
  it("un lesionado vale cero por bueno que sea", () => {
    const result = expectedPoints(
      input({
        status: "injured",
        player: player({ minutesPlayed: 3000, fantasyPoints: 400 }),
      }),
      league,
    );

    expect(result.expectedPoints).toBe(0);
    expect(result.riskOfZero).toBe(1);
    expect(result.explanation).toMatch(/Lesionado/);
  });

  it("un crack suplente vale menos que un titular del montón", () => {
    // La razón de modelar minutos y no puntos.
    const crackSuplente = expectedPoints(
      input({
        consensusStartProbability: 0.1,
        player: player({ playerId: "crack", fantasyPoints: 150 }),
      }),
      league,
    );
    const titularNormal = expectedPoints(
      input({
        consensusStartProbability: 0.95,
        player: player({ playerId: "normal", fantasyPoints: 45 }),
      }),
      league,
    );

    expect(titularNormal.expectedPoints).toBeGreaterThan(
      crackSuplente.expectedPoints,
    );
  });

  it("el riesgo de cero refleja la probabilidad de no jugar", () => {
    const dudoso = expectedPoints(
      input({ consensusStartProbability: 0.4 }),
      league,
    );
    const fijo = expectedPoints(
      input({ consensusStartProbability: 1 }),
      league,
    );

    expect(dudoso.riskOfZero).toBeGreaterThan(fijo.riskOfZero);
    expect(fijo.riskOfZero).toBe(0);
  });

  it("un partido favorable sube los puntos esperados", () => {
    const facil = expectedPoints(
      input({ outlook: outlook({ expectedGoalsFor: 2.4 }) }),
      league,
    );
    const dificil = expectedPoints(
      input({ outlook: outlook({ expectedGoalsFor: 0.7 }) }),
      league,
    );

    expect(facil.expectedPoints).toBeGreaterThan(dificil.expectedPoints);
  });

  it("baja la confianza cuando nadie ha opinado sobre el once", () => {
    const conFuentes = expectedPoints(
      input({ consensusStartProbability: 0.9, outlook: outlook() }),
      league,
    );
    const sinFuentes = expectedPoints(
      input({ consensusStartProbability: null, outlook: null }),
      league,
    );

    expect(conFuentes.confidence).toBe("high");
    expect(sinFuentes.confidence).toBe("low");
  });

  it("explica de dónde sale el número", () => {
    const result = expectedPoints(
      input({ outlook: outlook({ expectedGoalsFor: 2.4 }) }),
      league,
    );

    expect(result.explanation).toMatch(/titular/);
    expect(result.explanation).toMatch(/puntos por 90/);
    expect(result.explanation).toMatch(/rival/);
  });

  it("dice cuándo se está fiando de la racha y no de las fuentes", () => {
    const result = expectedPoints(
      input({ consensusStartProbability: null }),
      league,
    );
    expect(result.explanation).toMatch(/ninguna fuente ha opinado/);
  });
});

describe("computePositionAverages", () => {
  it("calcula los puntos por 90 medios de cada posición", () => {
    const averages = computePositionAverages([
      player({ positionId: 1, minutesPlayed: 900, fantasyPoints: 27 }),
      player({ positionId: 4, minutesPlayed: 900, fantasyPoints: 54 }),
    ]);

    expect(averages.get(1)).toBeCloseTo(2.7, 5);
    expect(averages.get(4)).toBeCloseTo(5.4, 5);
  });

  it("ignora a quien no ha jugado, para no hundir la media con ceros", () => {
    const averages = computePositionAverages([
      player({ positionId: 4, minutesPlayed: 900, fantasyPoints: 45 }),
      player({ positionId: 4, minutesPlayed: 0, fantasyPoints: 0 }),
    ]);

    expect(averages.get(4)).toBeCloseTo(4.5, 5);
  });
});
