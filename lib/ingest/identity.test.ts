import { describe, expect, it } from "vitest";
import {
  extractManagerName,
  extractMyTeamId,
  matchMyTeamByName,
} from "./sync";

/**
 * Identificar cuál de los equipos de la liga es el tuyo.
 *
 * Importa más de lo que parece: sin ello no hay plantilla que enseñar y el
 * motor de caja se queda sin el único saldo visible contra el que calibrarse.
 * Y equivocarse sería **silencioso** —la app enseñaría la plantilla de otro
 * como si fuera tuya—, así que ante la duda no se elige.
 */

/** Respuesta real de /v4/user/me, capturada el 2026-08-03. */
const ME_REAL = {
  id: "9887891",
  managerName: "chachesinhonor",
  locale: "es",
  avatar: "",
  banned: false,
  region: { id: "1" },
};

describe("extractManagerName", () => {
  it("saca el nombre de la respuesta real de la API", () => {
    expect(extractManagerName(ME_REAL)).toBe("chachesinhonor");
  });

  it("acepta los alias plausibles", () => {
    expect(extractManagerName({ name: "otro" })).toBe("otro");
    expect(extractManagerName({ nickname: "otro" })).toBe("otro");
  });

  it("ignora un nombre vacío o en blanco", () => {
    expect(extractManagerName({ managerName: "   " })).toBeNull();
    expect(extractManagerName({})).toBeNull();
    expect(extractManagerName(null)).toBeNull();
  });
});

describe("extractMyTeamId", () => {
  it("devuelve null con la respuesta real, que no trae equipos", () => {
    // Esto es lo que motiva el cruce por nombre: /v4/user/me da el usuario
    // pelado, y su `id` es el del usuario, NO el del equipo.
    expect(extractMyTeamId(ME_REAL, "L1")).toBeNull();
  });

  it("sigue funcionando si algún día la respuesta trae equipos", () => {
    const payload = { teams: [{ id: "T7", league: { id: "L1" } }] };
    expect(extractMyTeamId(payload, "L1")).toBe("T7");
  });

  it("no coge un equipo de otra liga", () => {
    const payload = { teams: [{ id: "T7", league: { id: "OTRA" } }] };
    expect(extractMyTeamId(payload, "L1")).toBeNull();
  });
});

describe("matchMyTeamByName", () => {
  const managers = [
    { id: "T1", managerName: "chachesinhonor" },
    { id: "T2", managerName: "otro" },
    { id: "T3", managerName: null },
  ];

  it("encuentra el equipo cruzando el nombre de manager", () => {
    expect(matchMyTeamByName("chachesinhonor", managers)).toBe("T1");
  });

  it("no se pierde por mayúsculas ni espacios", () => {
    expect(matchMyTeamByName("  ChacheSinHonor ", managers)).toBe("T1");
  });

  it("no elige cuando el nombre está repetido", () => {
    // Acertar por sorteo sería peor que no acertar: el error sería silencioso.
    const repetido = [
      { id: "T1", managerName: "igual" },
      { id: "T2", managerName: "igual" },
    ];
    expect(matchMyTeamByName("igual", repetido)).toBeNull();
  });

  it("devuelve null cuando no hay nombre o no hay coincidencia", () => {
    expect(matchMyTeamByName(null, managers)).toBeNull();
    expect(matchMyTeamByName("nadie", managers)).toBeNull();
  });

  it("no confunde un manager sin nombre con una coincidencia", () => {
    expect(matchMyTeamByName("", managers)).toBeNull();
  });
});
