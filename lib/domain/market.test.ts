import { describe, expect, it } from "vitest";
import { isListingOpen, partitionOpenListings } from "./market";

const NOW = new Date("2026-08-05T10:00:00Z");

const listing = (overrides: Partial<Parameters<typeof isListingOpen>[0]> = {}) => ({
  removedAt: null,
  expiresAt: null,
  ...overrides,
});

describe("isListingOpen", () => {
  it("da por viva una oferta sin retirar y sin caducidad", () => {
    expect(isListingOpen(listing(), NOW)).toBe(true);
  });

  /**
   * El bug que motivó todo esto: la fila de un jugador vendido hace meses
   * seguía contando como comprable, y no solo salía en la lista — entraba en
   * el cálculo del precio sombra del dinero.
   */
  it("descarta la que la sincronización vio desaparecer", () => {
    expect(
      isListingOpen(listing({ removedAt: new Date("2026-07-01T00:00:00Z") }), NOW),
    ).toBe(false);
  });

  it("descarta la caducada aunque nadie la haya retirado todavía", () => {
    expect(
      isListingOpen(listing({ expiresAt: new Date("2026-08-05T09:59:59Z") }), NOW),
    ).toBe(false);
  });

  it("mantiene la que caduca más tarde", () => {
    expect(
      isListingOpen(listing({ expiresAt: new Date("2026-08-05T10:00:01Z") }), NOW),
    ).toBe(true);
  });

  /** El instante exacto de caducidad ya no sirve para pujar. */
  it("trata la caducidad como cerrada en su propio instante", () => {
    expect(isListingOpen(listing({ expiresAt: NOW }), NOW)).toBe(false);
  });

  it("retirada manda sobre caducidad futura", () => {
    expect(
      isListingOpen(
        listing({
          removedAt: new Date("2026-08-04T00:00:00Z"),
          expiresAt: new Date("2026-08-06T00:00:00Z"),
        }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("partitionOpenListings", () => {
  it("separa sin perder ninguna", () => {
    const rows = [
      { id: "viva", ...listing() },
      { id: "retirada", ...listing({ removedAt: new Date("2026-07-01T00:00:00Z") }) },
      { id: "caducada", ...listing({ expiresAt: new Date("2026-08-01T00:00:00Z") }) },
      { id: "vigente", ...listing({ expiresAt: new Date("2026-08-09T00:00:00Z") }) },
    ];

    const { open, closed } = partitionOpenListings(rows, NOW);

    expect(open.map((r) => r.id)).toEqual(["viva", "vigente"]);
    expect(closed.map((r) => r.id)).toEqual(["retirada", "caducada"]);
  });

  it("con la lista vacía devuelve dos listas vacías", () => {
    expect(partitionOpenListings([], NOW)).toEqual({ open: [], closed: [] });
  });
});
