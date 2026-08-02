import { describe, expect, it } from "vitest";
import { bidMultiplier, cashEffectFor } from "./activity";

const base = {
  managerId: "yo",
  counterpartyManagerId: null,
  amount: 1_000_000,
  amountCertain: true,
};

describe("cashEffectFor", () => {
  it("ignora eventos que no tocan al manager", () => {
    const effect = cashEffectFor(
      { ...base, type: "market_purchase", managerId: "otro" },
      "yo",
    );
    expect(effect).toEqual({ delta: 0, certain: true });
  });

  it("resta en las compras y suma en las ventas", () => {
    expect(
      cashEffectFor({ ...base, type: "market_purchase" }, "yo").delta,
    ).toBe(-1_000_000);
    expect(cashEffectFor({ ...base, type: "market_sale" }, "yo").delta).toBe(
      1_000_000,
    );
  });

  it("mueve dinero en los dos sentidos en un traspaso entre managers", () => {
    const event = {
      ...base,
      type: "manager_transfer",
      managerId: "comprador",
      counterpartyManagerId: "vendedor",
    };
    expect(cashEffectFor(event, "comprador").delta).toBe(-1_000_000);
    expect(cashEffectFor(event, "vendedor").delta).toBe(1_000_000);
  });

  it("en un clausulazo el que paga pierde y el dueño anterior cobra", () => {
    const event = {
      ...base,
      type: "clause_paid",
      amount: 30_000_000,
      managerId: "atacante",
      counterpartyManagerId: "victima",
    };
    // El detalle que casi nadie considera: clausular financia al rival.
    expect(cashEffectFor(event, "atacante").delta).toBe(-30_000_000);
    expect(cashEffectFor(event, "victima").delta).toBe(30_000_000);
  });

  it("el blindaje solo cuesta a quien blinda", () => {
    const event = {
      ...base,
      type: "clause_raised",
      managerId: "yo",
      counterpartyManagerId: "otro",
    };
    expect(cashEffectFor(event, "yo").delta).toBe(-1_000_000);
    expect(cashEffectFor(event, "otro").delta).toBe(0);
  });

  it("marca incierto un evento que afecta pero sin importe", () => {
    const effect = cashEffectFor(
      { ...base, type: "market_purchase", amount: null },
      "yo",
    );
    // Clave: no asume cero, admite que no lo sabe. Eso ensancha la banda.
    expect(effect).toEqual({ delta: 0, certain: false });
  });

  it("marca incierto lo que no ha sabido clasificar", () => {
    expect(cashEffectFor({ ...base, type: "unknown" }, "yo").certain).toBe(
      false,
    );
  });

  it("propaga la incertidumbre declarada del importe", () => {
    const effect = cashEffectFor(
      { ...base, type: "market_sale", amountCertain: false },
      "yo",
    );
    expect(effect).toEqual({ delta: 1_000_000, certain: false });
  });
});

describe("bidMultiplier", () => {
  it("calcula cuánto se pagó por encima del valor de mercado", () => {
    expect(
      bidMultiplier({
        type: "market_purchase",
        amount: 12_000_000,
        marketValueAtTime: 10_000_000,
      }),
    ).toBeCloseTo(1.2);
  });

  it("solo mira compras del mercado, que son las que revelan la puja", () => {
    expect(
      bidMultiplier({
        type: "clause_paid",
        amount: 12_000_000,
        marketValueAtTime: 10_000_000,
      }),
    ).toBeNull();
  });

  it("devuelve null cuando falta cualquiera de los dos datos", () => {
    expect(
      bidMultiplier({
        type: "market_purchase",
        amount: null,
        marketValueAtTime: 10_000_000,
      }),
    ).toBeNull();
    expect(
      bidMultiplier({
        type: "market_purchase",
        amount: 12_000_000,
        marketValueAtTime: 0,
      }),
    ).toBeNull();
  });
});
