import { describe, expect, it } from "vitest";
import {
  ENDPOINT_TEMPLATES,
  KNOWN_WRITE_PATHS,
  buildPath,
  endpoints,
  isAllowedPath,
} from "./endpoints";

describe("allowlist de solo lectura", () => {
  it("acepta todas las rutas que generan los constructores", () => {
    const generated = [
      endpoints.me(),
      endpoints.leagues(),
      endpoints.standing("L1"),
      endpoints.standingWeek("L1", 12),
      endpoints.activity("L1", 0),
      endpoints.team("L1", "T9"),
      endpoints.lineup("T9"),
      endpoints.lineupWeek("T9", 12),
      endpoints.formations(),
      endpoints.players(),
      endpoints.player("P7", "L1"),
      endpoints.market("L1"),
      endpoints.currentWeek(),
      endpoints.calendar(),
      endpoints.weekStats(12),
    ];

    for (const path of generated) {
      expect(isAllowedPath(path), path).toBe(true);
    }
  });

  it("cubre todas las plantillas declaradas", () => {
    // Si alguien añade una plantilla y olvida su constructor, esto lo caza.
    for (const template of Object.values(ENDPOINT_TEMPLATES)) {
      const path = template.replace(/:([A-Za-z0-9_]+)/g, "123");
      expect(isAllowedPath(path), template).toBe(true);
    }
  });

  it("rechaza los endpoints de escritura conocidos", () => {
    // La razón de ser del módulo: pujar, clausular y blindar quedan fuera.
    for (const path of KNOWN_WRITE_PATHS) {
      expect(isAllowedPath(path), path).toBe(false);
    }
  });

  it("rechaza rutas arbitrarias y travesías de directorio", () => {
    expect(isAllowedPath("/v1/competition/1/leagues/../../admin")).toBe(false);
    expect(isAllowedPath("relativo/sin/barra")).toBe(false);
    expect(isAllowedPath("/v4/user/me/delete")).toBe(false);
    expect(isAllowedPath("")).toBe(false);
  });

  it("no deja que un parámetro con barras invente una ruta nueva", () => {
    // encodeURIComponent convierte la barra en %2F, así que el segmento
    // sigue siendo uno solo y la ruta resultante sigue siendo legal.
    const path = endpoints.team("L1", "T9/buyout/player");
    expect(path).not.toContain("buyout/player");
    expect(isAllowedPath(path)).toBe(true);
  });

  it("falla si falta un parámetro en vez de generar una ruta rota", () => {
    expect(() => buildPath(ENDPOINT_TEMPLATES.standing, {})).toThrow(
      /Falta el parámetro/,
    );
  });

  it("rechaza parámetros vacíos", () => {
    expect(() => endpoints.standing("")).toThrow();
  });
});
