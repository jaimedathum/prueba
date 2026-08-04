import { describe, expect, it } from "vitest";
import { parsePlayer, parseRealTeam } from "./parse";

/**
 * El jugador y su equipo salen del mismo objeto y tienen que salir de acuerdo.
 *
 * Cuando no lo estuvieron, un jugador quedaba apuntando a un equipo que nunca
 * se había guardado y Postgres abortaba el INSERT entero por clave ajena — se
 * caía la sincronización completa, no una fila.
 */

describe("parseRealTeam va del brazo de parsePlayer", () => {
  const formas = [
    { nombre: "objeto team anidado", raw: { team: { id: "T1", name: "Betis" } } },
    { nombre: "teamId plano", raw: { teamId: "T1" } },
    { nombre: "realTeamId plano", raw: { realTeamId: "T1" } },
  ];

  for (const { nombre, raw } of formas) {
    it(`saca el mismo id que el jugador con ${nombre}`, () => {
      const ficha = { id: "P1", name: "Jugador", positionId: 3, ...raw };

      const { player } = parsePlayer(ficha);
      const team = parseRealTeam(ficha);

      expect(player?.realTeamId).toBe("T1");
      // Lo que de verdad importa: si el jugador tiene equipo, el equipo existe.
      expect(team?.id).toBe(player?.realTeamId);
    });
  }

  it("usa el id como nombre cuando el equipo no trae ninguno", () => {
    // Preferible a descartar el equipo: se conserva el vínculo del que
    // dependen el modelo de equipos y el ajuste por rival.
    expect(parseRealTeam({ teamId: "T9" })).toMatchObject({
      id: "T9",
      name: "T9",
    });
  });

  it("prefiere el nombre de verdad cuando llega", () => {
    expect(parseRealTeam({ team: { id: "T1", name: "Betis" } })?.name).toBe(
      "Betis",
    );
  });

  it("devuelve null cuando no hay equipo por ninguna vía", () => {
    const ficha = { id: "P1", name: "Jugador", positionId: 3 };

    expect(parseRealTeam(ficha)).toBeNull();
    // Y el jugador tampoco inventa uno: sin equipo es null, no una cadena.
    expect(parsePlayer(ficha).player?.realTeamId).toBeNull();
  });

  it("no se rompe con basura", () => {
    expect(parseRealTeam(null)).toBeNull();
    expect(parseRealTeam("texto")).toBeNull();
    expect(parseRealTeam({ team: "no es un objeto" })).toBeNull();
  });
});
