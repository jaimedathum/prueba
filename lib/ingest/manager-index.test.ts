import { describe, expect, it } from "vitest";
import {
  buildManagerIndex,
  resolveManagerRef,
  resolveManagerRefs,
} from "./manager-index";

/**
 * El bug que motivó esto: en `/rivales` todos los managers aparecían con la
 * misma caja estimada, y encima con la del dueño del despliegue.
 *
 * La causa no estaba en el motor de caja sino un paso antes: el feed de
 * actividad identifica a los managers por **usuario** y la clasificación por
 * **equipo**. Al no cruzarse, cada movimiento perdía su dueño, nadie gastaba
 * ni ingresaba, todas las cajas se quedaban en el presupuesto inicial y la
 * calibración las desplazaba a todas a la vez para cuadrar el saldo propio.
 */

const MANAGERS = [
  { id: "equipo-1", userId: "usuario-1" },
  { id: "equipo-2", userId: "usuario-2" },
  { id: "equipo-3", userId: null },
];

describe("buildManagerIndex", () => {
  const index = buildManagerIndex(MANAGERS);

  it("reconoce el id de equipo", () => {
    expect(resolveManagerRef(index, "equipo-1")).toBe("equipo-1");
  });

  /** Lo que el feed trae de verdad, y lo que antes se perdía. */
  it("traduce el id de usuario al de equipo", () => {
    expect(resolveManagerRef(index, "usuario-2")).toBe("equipo-2");
  });

  it("aguanta que un manager no tenga id de usuario", () => {
    expect(resolveManagerRef(index, "equipo-3")).toBe("equipo-3");
  });

  /**
   * Nunca devolver la referencia original: una clave ajena inventada tumbaría
   * el INSERT del feed entero.
   */
  it("descarta lo que no reconoce", () => {
    expect(resolveManagerRef(index, "de-otra-liga")).toBeNull();
    expect(resolveManagerRef(index, null)).toBeNull();
    expect(resolveManagerRef(index, undefined)).toBeNull();
    expect(resolveManagerRef(index, "")).toBeNull();
  });
});

describe("resolveManagerRefs", () => {
  const index = buildManagerIndex(MANAGERS);

  it("cuenta lo resuelto y lista lo desconocido sin repetir", () => {
    const report = resolveManagerRefs(index, [
      "equipo-1",
      "usuario-2",
      "fantasma",
      "fantasma",
      null,
    ]);

    expect(report.resolved).toBe(2);
    expect(report.unknown).toEqual(["fantasma"]);
  });

  /**
   * El caso exacto del bug: un feed entero sin atribuir. Lo que importa es
   * que quede **contado**, porque antes se anulaba en silencio y la pantalla
   * salía idéntica a la de un feed vacío.
   */
  it("deja constancia cuando no se resuelve nada", () => {
    const report = resolveManagerRefs(index, ["u9", "u8", "u7"]);

    expect(report.resolved).toBe(0);
    expect(report.unknown).toHaveLength(3);
  });

  it("no cuenta los huecos como fallos", () => {
    expect(resolveManagerRefs(index, [null, undefined, ""])).toEqual({
      resolved: 0,
      unknown: [],
    });
  });
});
