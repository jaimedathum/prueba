import { describe, expect, it } from "vitest";
import { applyOverride, applyOverrides, type OverrideMap } from "./overrides";

const overrides: OverrideMap = new Map([
  ["P1", { marketValue: 9_000_000, status: "injured" }],
  ["P404", { campoQueNoExiste: 1 }],
]);

describe("applyOverride", () => {
  it("sobrescribe el dato sincronizado con la corrección manual", () => {
    const row = { id: "P1", marketValue: 5_000_000, status: "ok" };
    const result = applyOverride(row, "P1", overrides);

    expect(result.marketValue).toBe(9_000_000);
    expect(result.status).toBe("injured");
  });

  it("deja constancia de qué campos son manuales", () => {
    // La UI necesita distinguirlos: un dato tocado a mano no merece la misma
    // confianza que uno sincronizado, y al revés.
    const row = { id: "P1", marketValue: 5_000_000, status: "ok" };
    const result = applyOverride(row, "P1", overrides);

    expect(result.overriddenFields.sort()).toEqual(["marketValue", "status"]);
  });

  it("no toca las filas sin corrección", () => {
    const row = { id: "P2", marketValue: 5_000_000 };
    const result = applyOverride(row, "P2", overrides);

    expect(result.marketValue).toBe(5_000_000);
    expect(result.overriddenFields).toEqual([]);
  });

  it("ignora overrides sobre campos que no existen", () => {
    // Casi siempre es una errata; inventar la propiedad solo escondería el error.
    const row = { id: "P404", marketValue: 1 };
    const result = applyOverride(row, "P404", overrides);

    expect(result).not.toHaveProperty("campoQueNoExiste");
    expect(result.overriddenFields).toEqual([]);
  });

  it("no muta la fila original", () => {
    const row = { id: "P1", marketValue: 5_000_000, status: "ok" };
    applyOverride(row, "P1", overrides);

    expect(row.marketValue).toBe(5_000_000);
  });
});

describe("applyOverrides", () => {
  it("aplica la corrección a cada fila por su id", () => {
    const rows = [
      { id: "P1", marketValue: 5_000_000, status: "ok" },
      { id: "P2", marketValue: 3_000_000, status: "ok" },
    ];
    const result = applyOverrides(rows, (r) => r.id, overrides);

    expect(result[0]!.marketValue).toBe(9_000_000);
    expect(result[1]!.marketValue).toBe(3_000_000);
  });
});
