import { describe, expect, it } from "vitest";
import type { CashBand } from "./budget";
import {
  bidForProbability,
  exceedanceProbability,
  optimalBid,
  probabilityOfWinning,
  probabilityRivalOutbids,
  type AuctionInput,
  type RivalBidder,
} from "./auction";
import {
  estimateEuroPerPoint,
  planTransfers,
  type MarketOption,
  type SquadPlayer,
  type TransferOptions,
} from "./transfers";
import {
  decideExit,
  evaluateSpeculation,
  type OpenPosition,
  type SpeculationInput,
} from "./speculation";
import type { PricePrediction } from "./value";
import type { Formation } from "./lineup";

function cash(min: number, max: number): CashBand {
  return {
    managerId: "r",
    min,
    max,
    point: (min + max) / 2,
    confidence: "medium",
    uncertainEvents: 0,
    totalEvents: 5,
  };
}

/* ------------------------------------------------------------------ *
 * Subasta
 * ------------------------------------------------------------------ */

function rival(overrides: Partial<RivalBidder> = {}): RivalBidder {
  return {
    managerId: "rival",
    multipliers: [1.1, 1.15, 1.2, 1.25, 1.1, 1.3],
    cash: cash(30_000_000, 40_000_000),
    interest: 1,
    ...overrides,
  };
}

function auction(overrides: Partial<AuctionInput> = {}): AuctionInput {
  return {
    marketValue: 10_000_000,
    myValuation: 20_000_000,
    cashCostMultiplier: 1,
    rivals: [rival()],
    leagueMultipliers: [1.05, 1.1, 1.2, 1.3, 1.5],
    availableCash: 50_000_000,
    ...overrides,
  };
}

describe("exceedanceProbability", () => {
  it("mezcla el historial del rival con el de la liga", () => {
    // Con dos observaciones no se puede afirmar que alguien sea conservador.
    const conPocas = exceedanceProbability([1.05, 1.05], [1.5, 1.6, 1.7], 1.4);
    expect(conPocas).toBeGreaterThan(0);
    expect(conPocas).toBeLessThan(1);
  });

  it("con mucho historial propio manda el rival", () => {
    const conservador = Array.from({ length: 50 }, () => 1.05);
    const p = exceedanceProbability(conservador, [1.5, 1.6, 1.7], 1.4);
    expect(p).toBeLessThan(0.2);
  });

  it("sin ningún dato asume que se puja alrededor del valor", () => {
    expect(exceedanceProbability([], [], 0.9)).toBe(1);
    expect(exceedanceProbability([], [], 1.5)).toBeLessThan(0.5);
  });
});

describe("probabilityRivalOutbids", () => {
  it("un rival sin interés no puja", () => {
    const sinInteres = rival({ interest: 0 });
    expect(probabilityRivalOutbids(sinInteres, auction(), 12_000_000)).toBe(0);
  });

  it("un rival sin caja no puede superarte", () => {
    const pobre = rival({ cash: cash(0, 1_000_000) });
    expect(probabilityRivalOutbids(pobre, auction(), 12_000_000)).toBe(0);
  });

  it("cuanto más pujas, menos probable es que te superen", () => {
    const input = auction();
    const baja = probabilityRivalOutbids(rival(), input, 11_000_000);
    const alta = probabilityRivalOutbids(rival(), input, 18_000_000);
    expect(alta).toBeLessThan(baja);
  });
});

describe("optimalBid", () => {
  it("la probabilidad de ganar crece con la puja", () => {
    const input = auction();
    expect(probabilityOfWinning(input, 18_000_000)).toBeGreaterThan(
      probabilityOfWinning(input, 11_000_000),
    );
  });

  it("recomienda una puja por encima del suelo y por debajo de tu valoración", () => {
    const result = optimalBid(auction());

    expect(result.optimalBid).not.toBeNull();
    expect(result.optimalBid!).toBeGreaterThanOrEqual(10_000_000);
    expect(result.optimalBid!).toBeLessThan(20_000_000);
    expect(result.expectedSurplus).toBeGreaterThan(0);
  });

  it("sin rivales interesados basta con acercarse al suelo", () => {
    const result = optimalBid(auction({ rivals: [] }));
    expect(result.optimalBid).toBe(10_000_000);
    expect(result.probabilityOfWinning).toBe(1);
    expect(result.reason).toMatch(/Nadie más/);
  });

  it("una liga agresiva obliga a pujar más alto", () => {
    const conservadora = optimalBid(
      auction({ rivals: [rival({ multipliers: Array(30).fill(1.05) })] }),
    );
    const agresiva = optimalBid(
      auction({ rivals: [rival({ multipliers: Array(30).fill(1.6) })] }),
    );

    expect(agresiva.optimalBid!).toBeGreaterThan(conservadora.optimalBid!);
  });

  it("si el dinero te cuesta más, pujas menos", () => {
    // Es la conexión con el optimizador de fichajes.
    const sobrado = optimalBid(auction({ cashCostMultiplier: 1 }));
    const justo = optimalBid(auction({ cashCostMultiplier: 1.5 }));

    expect(justo.optimalBid!).toBeLessThan(sobrado.optimalBid!);
  });

  it("no puja si no llega ni al suelo", () => {
    const result = optimalBid(auction({ availableCash: 5_000_000 }));
    expect(result.optimalBid).toBeNull();
    expect(result.reason).toMatch(/No llegas ni al suelo/);
  });

  it("no puja si el jugador vale para ti menos que el suelo", () => {
    const result = optimalBid(auction({ myValuation: 8_000_000 }));
    expect(result.optimalBid).toBeNull();
    expect(result.reason).toMatch(/No compensa/);
  });

  it("da los consejos que salen de las reglas del juego", () => {
    const result = optimalBid(auction());
    expect(result.tips.join(" ")).toMatch(/pronto/);
    expect(result.tips.join(" ")).toMatch(/no redonda/);
  });

  it("la curva permite ver qué cuesta subir la probabilidad", () => {
    const result = optimalBid(auction());
    const para80 = bidForProbability(result, 0.8);

    expect(para80).not.toBeNull();
    expect(para80!.probabilityOfWinning).toBeGreaterThanOrEqual(0.8);
  });
});

/* ------------------------------------------------------------------ *
 * Fichajes
 * ------------------------------------------------------------------ */

const FORMACIONES: Formation[] = [
  { name: "4-4-2", slots: { PT: 1, DF: 4, MC: 4, DL: 2 } },
  { name: "4-3-3", slots: { PT: 1, DF: 4, MC: 3, DL: 3 } },
];

function squadPlayer(
  id: string,
  positionId: number,
  expectedPoints: number,
  overrides: Partial<SquadPlayer> = {},
): SquadPlayer {
  return {
    playerId: id,
    name: id,
    positionId,
    expectedPoints,
    riskOfZero: 0,
    saleValue: 5_000_000,
    expectedValueChange: 0,
    ...overrides,
  };
}

function baseSquad(): SquadPlayer[] {
  const squad: SquadPlayer[] = [];
  for (let i = 0; i < 2; i++) squad.push(squadPlayer(`PT${i}`, 1, 4 - i));
  for (let i = 0; i < 5; i++) squad.push(squadPlayer(`DF${i}`, 2, 5 - i * 0.5));
  for (let i = 0; i < 5; i++) squad.push(squadPlayer(`MC${i}`, 3, 5 - i * 0.5));
  for (let i = 0; i < 4; i++) squad.push(squadPlayer(`DL${i}`, 4, 5 - i * 0.5));
  return squad;
}

function transferOptions(
  overrides: Partial<TransferOptions> = {},
): TransferOptions {
  return {
    formations: FORMACIONES,
    availableCash: 20_000_000,
    horizonMatchdays: 5,
    euroPerPoint: 1_000_000,
    ...overrides,
  };
}

describe("planTransfers", () => {
  it("no recomienda nada cuando no hay mejora", () => {
    const result = planTransfers(baseSquad(), [], transferOptions());
    expect(result.best.sell).toHaveLength(0);
    expect(result.best.buy).toHaveLength(0);
    expect(result.best.explanation).toMatch(/No hay ninguna operación/);
  });

  it("ficha a un jugador claramente mejor si hay caja", () => {
    const crack: MarketOption = {
      ...squadPlayer("CRACK", 4, 12),
      acquisitionCost: 10_000_000,
    };

    const result = planTransfers(baseSquad(), [crack], transferOptions());
    expect(result.best.buy.map((p) => p.playerId)).toContain("CRACK");
    expect(result.best.deltaLineupPoints).toBeGreaterThan(0);
  });

  it("valora la mejora sobre el once, no sobre el jugador aislado", () => {
    // Un portero de 12 puntos mejora mucho; un cuarto delantero de 5,5 apenas
    // entra en el once y no aporta casi nada aunque su nota parezca alta.
    const porteroBueno: MarketOption = {
      ...squadPlayer("PT_TOP", 1, 12),
      acquisitionCost: 8_000_000,
    };
    const delanteroMediocre: MarketOption = {
      ...squadPlayer("DL_MID", 4, 5.5),
      acquisitionCost: 8_000_000,
    };

    const result = planTransfers(
      baseSquad(),
      [porteroBueno, delanteroMediocre],
      transferOptions({ maxBuys: 1 }),
    );

    expect(result.best.buy[0]!.playerId).toBe("PT_TOP");
  });

  it("respeta la caja disponible", () => {
    const carisimo: MarketOption = {
      ...squadPlayer("CARO", 4, 20),
      acquisitionCost: 90_000_000,
    };

    const result = planTransfers(
      baseSquad(),
      [carisimo],
      transferOptions({ availableCash: 1_000_000, maxSells: 0 }),
    );

    expect(result.best.buy).toHaveLength(0);
  });

  it("vende para poder fichar cuando compensa", () => {
    const crack: MarketOption = {
      ...squadPlayer("CRACK", 4, 15),
      acquisitionCost: 24_000_000,
    };

    const result = planTransfers(
      baseSquad(),
      [crack],
      transferOptions({ availableCash: 15_000_000 }),
    );

    expect(result.best.buy.map((p) => p.playerId)).toContain("CRACK");
    expect(result.best.sell.length).toBeGreaterThan(0);
  });

  it("con caja de sobra, un euro cuesta un euro", () => {
    const result = planTransfers(
      baseSquad(),
      [],
      transferOptions({ availableCash: 500_000_000 }),
    );
    expect(result.cashCostMultiplier).toBe(1);
  });

  it("con la caja justa, el euro vale más de un euro", () => {
    // Es el precio sombra: hay una operación buena que no puedes permitirte.
    const crack: MarketOption = {
      ...squadPlayer("CRACK", 4, 30),
      acquisitionCost: 12_000_000,
    };

    const result = planTransfers(
      baseSquad(),
      [crack],
      transferOptions({ availableCash: 11_000_000, maxSells: 0 }),
    );

    expect(result.cashCostMultiplier).toBeGreaterThan(1);
  });

  it("la fricción evita recomendar cambios cosméticos", () => {
    const marginal: MarketOption = {
      ...squadPlayer("MARGINAL", 4, 5.1),
      acquisitionCost: 1_000_000,
    };

    const sinFriccion = planTransfers(
      baseSquad(),
      [marginal],
      transferOptions(),
    );
    const conFriccion = planTransfers(
      baseSquad(),
      [marginal],
      transferOptions({ frictionPerMove: 5_000_000 }),
    );

    expect(sinFriccion.best.buy.length).toBeGreaterThanOrEqual(
      conFriccion.best.buy.length,
    );
  });
});

describe("estimateEuroPerPoint", () => {
  it("estima el tipo de cambio de la liga", () => {
    const players = Array.from({ length: 30 }, (_, i) => ({
      expectedPoints: i + 1,
      marketValue: (i + 1) * 2_000_000,
    }));
    expect(estimateEuroPerPoint(players)).toBeCloseTo(2_000_000, -4);
  });

  it("no inventa un número con pocos datos", () => {
    expect(estimateEuroPerPoint([{ expectedPoints: 5, marketValue: 1 }])).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Especulación
 * ------------------------------------------------------------------ */

function prediction(
  median: number,
  probabilityOfLoss: number,
  usable = true,
): PricePrediction {
  return {
    median,
    quantiles: new Map([
      [0.1, median - 0.05],
      [0.5, median],
      [0.9, median + 0.05],
    ]),
    probabilityOfLoss,
    usable,
  };
}

function speculation(
  overrides: Partial<SpeculationInput> = {},
): SpeculationInput {
  return {
    playerId: "P1",
    name: "Especulativo",
    marketValue: 8_000_000,
    prediction: prediction(0.25, 0.12),
    cashCostMultiplier: 1,
    slotCost: 0,
    lossTolerance: 0.2,
    liquidityFactor: 1,
    availableCash: 30_000_000,
    ...overrides,
  };
}

describe("evaluateSpeculation", () => {
  it("da el precio máximo al que la operación tiene sentido", () => {
    const result = evaluateSpeculation(speculation());

    expect(result.verdict).toBe("buy");
    expect(result.maxPrice).toBeCloseTo(10_000_000, -4);
    expect(result.reason).toMatch(/Fichable hasta/);
  });

  it("rechaza lo que supera tu tolerancia al riesgo", () => {
    const result = evaluateSpeculation(
      speculation({ prediction: prediction(0.3, 0.45) }),
    );

    expect(result.verdict).toBe("too-risky");
    expect(result.maxPrice).toBeNull();
  });

  it("no decide con un modelo que aún no es fiable", () => {
    // Sirve para ordenar candidatos, no para poner dinero.
    const result = evaluateSpeculation(
      speculation({ prediction: prediction(0.3, 0.1, false) }),
    );

    expect(result.verdict).toBe("unreliable-model");
    expect(result.maxPrice).toBeNull();
  });

  it("si el dinero te cuesta más, el precio máximo baja", () => {
    const sobrado = evaluateSpeculation(speculation({ cashCostMultiplier: 1 }));
    const justo = evaluateSpeculation(speculation({ cashCostMultiplier: 1.15 }));

    expect(justo.maxPrice!).toBeLessThan(sobrado.maxPrice!);
  });

  it("con el dinero muy caro, la especulación deja de tener margen", () => {
    // Inmovilizar capital que necesitas para otra cosa se come la ganancia.
    const result = evaluateSpeculation(speculation({ cashCostMultiplier: 1.4 }));
    expect(result.verdict).toBe("no-margin");
  });

  it("ocupar una plaza de plantilla reduce el margen", () => {
    const conHueco = evaluateSpeculation(speculation({ slotCost: 0 }));
    const sinHueco = evaluateSpeculation(speculation({ slotCost: 1_500_000 }));

    expect(sinHueco.maxPrice!).toBeLessThan(conHueco.maxPrice!);
  });

  it("una salida ilíquida descuenta el valor de venta", () => {
    const liquido = evaluateSpeculation(speculation({ liquidityFactor: 1 }));
    const ilíquido = evaluateSpeculation(speculation({ liquidityFactor: 0.8 }));

    expect(ilíquido.expectedExitValue).toBeLessThan(liquido.expectedExitValue);
  });

  it("descarta cuando no queda margen sobre el suelo de la puja", () => {
    // Sube poco y encima hay que descontar el riesgo de no poder vender:
    // la salida esperada acaba por debajo de lo que cuesta entrar.
    const result = evaluateSpeculation(
      speculation({ prediction: prediction(0.02, 0.1), liquidityFactor: 0.9 }),
    );

    expect(result.verdict).toBe("no-margin");
    expect(result.reason).toMatch(/No hay margen/);
  });

  it("una cláusula alta mejora la salida esperada", () => {
    // Que te lo clausulen puede ser la mejor manera de cerrar la posición.
    const sinClausula = evaluateSpeculation(speculation());
    const conClausula = evaluateSpeculation(
      speculation({ buyoutClause: 20_000_000, clauseExitProbability: 0.3 }),
    );

    expect(conClausula.expectedExitValue).toBeGreaterThan(
      sinClausula.expectedExitValue,
    );
    expect(conClausula.maxPrice!).toBeGreaterThan(sinClausula.maxPrice!);
  });
});

describe("decideExit", () => {
  function position(overrides: Partial<OpenPosition> = {}): OpenPosition {
    return {
      playerId: "P1",
      name: "Especulativo",
      entryPrice: 8_000_000,
      currentValue: 9_000_000,
      targetValue: 11_000_000,
      prediction: prediction(0.1, 0.15),
      acceleration: 0.01,
      bestAlternativeSurplus: 0,
      stopLossFraction: 0.15,
      ...overrides,
    };
  }

  it("vende al alcanzar el objetivo", () => {
    const decision = decideExit(position({ currentValue: 11_500_000 }));
    expect(decision.action).toBe("sell");
    expect(decision.reason).toBe("target-reached");
    expect(decision.profit).toBe(3_500_000);
  });

  it("corta cuando la tesis falla", () => {
    const decision = decideExit(position({ currentValue: 6_500_000 }));
    expect(decision.reason).toBe("stop-loss");
    expect(decision.message).toMatch(/sin discutir/);
  });

  it("vende cuando el movimiento se agota", () => {
    const decision = decideExit(
      position({ prediction: prediction(-0.02, 0.7), acceleration: -0.03 }),
    );
    expect(decision.reason).toBe("momentum-exhausted");
  });

  it("liquida si hay un uso mejor para el dinero", () => {
    const decision = decideExit(
      position({ bestAlternativeSurplus: 5_000_000 }),
    );
    expect(decision.reason).toBe("opportunity-cost");
  });

  it("mantiene mientras la tesis siga viva", () => {
    const decision = decideExit(position());
    expect(decision.action).toBe("hold");
  });

  it("el stop manda sobre el coste de oportunidad", () => {
    // Cortar una pérdida es más urgente que reasignar capital.
    const decision = decideExit(
      position({ currentValue: 6_000_000, bestAlternativeSurplus: 9_000_000 }),
    );
    expect(decision.reason).toBe("stop-loss");
  });
});
