import { describe, expect, it } from "vitest";
import {
  classifyActivityType,
  normalizeStatus,
  parseActivityEvent,
  parseMarketListing,
  parsePlayer,
} from "./parse";

describe("parsePlayer", () => {
  it("lee los campos con el nombre principal", () => {
    const { player } = parsePlayer({
      id: "P1",
      name: "Jugador",
      positionId: 4,
      team: { id: "T1" },
      marketValue: 12_000_000,
      points: 88,
    });
    expect(player).toMatchObject({
      id: "P1",
      positionId: 4,
      realTeamId: "T1",
      marketValue: 12_000_000,
    });
  });

  it("acepta alias distintos para el mismo campo", () => {
    const { player } = parsePlayer({
      playerId: "P2",
      nickname: "Alias",
      position: 1,
      value: 5_000_000,
    });
    expect(player).toMatchObject({ id: "P2", positionId: 1, marketValue: 5_000_000 });
  });

  it("devuelve null si falta un campo imprescindible en vez de inventarlo", () => {
    const { player, mapper } = parsePlayer({ name: "Sin id" });
    expect(player).toBeNull();
    expect(mapper.misses.length).toBeGreaterThan(0);
  });

  it("registra los campos que nadie ha leído", () => {
    const { mapper } = parsePlayer({
      id: "P3",
      name: "X",
      positionId: 2,
      campoNuevoQueNoConocemos: 42,
    });
    expect(mapper.unusedKeys()).toContain("campoNuevoQueNoConocemos");
  });
});

describe("normalizeStatus", () => {
  it("normaliza los estados conocidos en español e inglés", () => {
    expect(normalizeStatus("lesionado")).toBe("injured");
    expect(normalizeStatus("INJURED")).toBe("injured");
    expect(normalizeStatus("duda")).toBe("doubtful");
    expect(normalizeStatus("sancionado")).toBe("suspended");
  });

  it("lo que no reconoce se queda en unknown", () => {
    expect(normalizeStatus("estado_raro")).toBe("unknown");
    expect(normalizeStatus(null)).toBe("unknown");
  });
});

describe("classifyActivityType", () => {
  it("reconoce los movimientos que mueven caja", () => {
    expect(classifyActivityType("clausulazo")).toBe("clause_paid");
    expect(classifyActivityType("blindaje")).toBe("clause_raised");
    expect(classifyActivityType("compra")).toBe("market_purchase");
    expect(classifyActivityType("venta")).toBe("market_sale");
    expect(classifyActivityType("premio jornada")).toBe("prize");
  });

  it("prioriza clausulazo sobre compra cuando el texto contiene ambos", () => {
    // "compra por cláusula" es un clausulazo, no una puja de mercado:
    // el dinero va al rival, no al banco.
    expect(classifyActivityType("compra por clausula")).toBe("clause_paid");
  });

  it("deja en unknown lo que no entiende", () => {
    expect(classifyActivityType("operacion_tipo_17")).toBe("unknown");
    expect(classifyActivityType(null)).toBe("unknown");
  });
});

describe("parseActivityEvent", () => {
  it("clasifica y extrae un clausulazo", () => {
    const { event } = parseActivityEvent(
      {
        id: "E1",
        date: "2026-03-01T10:00:00Z",
        type: "clausulazo",
        team: { id: "atacante" },
        sellerTeam: { id: "victima" },
        player: { id: "P9" },
        amount: 30_000_000,
      },
      "L1",
    );
    expect(event).toMatchObject({
      id: "E1",
      type: "clause_paid",
      managerId: "atacante",
      counterpartyManagerId: "victima",
      amount: 30_000_000,
      amountCertain: true,
    });
  });

  it("marca incierto un evento sin importe", () => {
    const { event } = parseActivityEvent(
      { id: "E2", date: "2026-03-01T10:00:00Z", type: "compra" },
      "L1",
    );
    expect(event?.amount).toBeNull();
    expect(event?.amountCertain).toBe(false);
  });

  it("marca incierto un evento que no sabe clasificar aunque traiga importe", () => {
    const { event } = parseActivityEvent(
      {
        id: "E3",
        date: "2026-03-01T10:00:00Z",
        type: "operacion_desconocida",
        amount: 1_000_000,
      },
      "L1",
    );
    expect(event?.type).toBe("unknown");
    expect(event?.amountCertain).toBe(false);
  });

  it("genera un id estable cuando el feed no trae uno", () => {
    const payload = {
      date: "2026-03-01T10:00:00Z",
      type: "compra",
      team: { id: "yo" },
      player: { id: "P1" },
      amount: 5_000_000,
    };
    const a = parseActivityEvent(payload, "L1").event;
    const b = parseActivityEvent(payload, "L1").event;
    expect(a?.id).toBe(b?.id);
    // Y distinto si cambia la liga: no se mezclan eventos entre ligas.
    const c = parseActivityEvent(payload, "L2").event;
    expect(c?.id).not.toBe(a?.id);
  });

  it("acepta fechas en epoch de segundos y de milisegundos", () => {
    const segundos = parseActivityEvent(
      { date: 1_772_000_000, type: "compra" },
      "L1",
    ).event;
    const milis = parseActivityEvent(
      { date: 1_772_000_000_000, type: "compra" },
      "L1",
    ).event;
    expect(segundos?.occurredAt.getTime()).toBe(1_772_000_000_000);
    expect(milis?.occurredAt.getTime()).toBe(1_772_000_000_000);
  });

  it("descarta el evento si no hay fecha: sin fecha no sirve para la caja", () => {
    const { event } = parseActivityEvent({ type: "compra" }, "L1");
    expect(event).toBeNull();
  });
});

describe("parseMarketListing", () => {
  it("distingue un jugador libre de uno vendido por un manager", () => {
    const libre = parseMarketListing({
      id: "M1",
      playerMaster: { id: "P1", marketValue: 8_000_000 },
    }).listing;
    expect(libre?.sellerManagerId).toBeNull();

    const deManager = parseMarketListing({
      id: "M2",
      playerMaster: { id: "P2", marketValue: 8_000_000 },
      sellerTeam: { id: "rival" },
    }).listing;
    expect(deManager?.sellerManagerId).toBe("rival");
  });

  it("normaliza importes con separador de miles", () => {
    const { listing } = parseMarketListing({
      id: "M3",
      playerMaster: { id: "P3", marketValue: "12.500.000" },
    });
    expect(listing?.marketValue).toBe(12_500_000);
  });
});
