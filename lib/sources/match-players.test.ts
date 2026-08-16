import { describe, expect, it } from "vitest";
import {
  buildPlayerIndex,
  matchPlayer,
  normalizeName,
  type MatchablePlayer,
} from "./match-players";

const player = (
  id: string,
  name: string,
  nickname: string | null = null,
  realTeamId: string | null = "t1",
): MatchablePlayer => ({ id, name, nickname, realTeamId });

const PLANTILLA = [
  player("1", "Robert Lewandowski", "Lewandowski", "barca"),
  player("2", "Federico Valverde", "Fede Valverde", "madrid"),
  player("3", "Álvaro Morata", "Morata", "atleti"),
  player("4", "Iñaki Williams", null, "athletic"),
  player("5", "Nico Williams", null, "athletic"),
];

describe("normalizeName", () => {
  it("quita acentos, puntuación y mayúsculas", () => {
    expect(normalizeName("Álvaro MORATA")).toBe("alvaro morata");
    expect(normalizeName("R. Lewandowski")).toBe("r lewandowski");
    expect(normalizeName("  Iñaki   Williams ")).toBe("inaki williams");
  });

  it("es estable ante escrituras distintas del mismo nombre", () => {
    expect(normalizeName("Güiza")).toBe(normalizeName("Guiza"));
  });
});

describe("matchPlayer", () => {
  const index = buildPlayerIndex(PLANTILLA);

  it("empareja por nombre completo", () => {
    expect(matchPlayer(index, "Robert Lewandowski")).toEqual({
      status: "matched",
      playerId: "1",
      via: "full-name",
    });
  });

  it("empareja por apodo", () => {
    expect(matchPlayer(index, "Fede Valverde")).toMatchObject({
      status: "matched",
      playerId: "2",
    });
  });

  it("empareja aunque la fuente abrevie el nombre de pila", () => {
    expect(matchPlayer(index, "R. Lewandowski")).toEqual({
      status: "matched",
      playerId: "1",
      via: "last-name",
    });
  });

  it("no le importan los acentos", () => {
    expect(matchPlayer(index, "Alvaro Morata")).toMatchObject({
      status: "matched",
      playerId: "3",
    });
  });

  /**
   * El caso que justifica exigir unicidad. Dos hermanos en el mismo equipo y
   * con el mismo apellido: elegir uno movería la titularidad del otro, y las
   * proyecciones saldrían igual de convincentes pero mal.
   */
  it("se niega a elegir entre dos apellidos iguales", () => {
    const outcome = matchPlayer(index, "Williams");
    expect(outcome.status).toBe("ambiguous");
    expect(outcome.status === "ambiguous" && outcome.candidates.sort()).toEqual([
      "4",
      "5",
    ]);
  });

  it("el equipo deshace el empate cuando la fuente lo dice", () => {
    const conDosEquipos = buildPlayerIndex([
      player("10", "Juan García", null, "equipo-a"),
      player("11", "Juan García", null, "equipo-b"),
    ]);

    expect(matchPlayer(conDosEquipos, "Juan García", "equipo-b")).toMatchObject({
      status: "matched",
      playerId: "11",
    });
    expect(matchPlayer(conDosEquipos, "Juan García").status).toBe("ambiguous");
  });

  it("devuelve no encontrado en vez de inventarse un parecido", () => {
    expect(matchPlayer(index, "Cristiano Ronaldo")).toEqual({
      status: "not-found",
    });
    expect(matchPlayer(index, "   ")).toEqual({ status: "not-found" });
  });

  it("no duplica al jugador que llega por nombre y por apodo", () => {
    const solo = buildPlayerIndex([player("9", "Morata", "Morata", "atleti")]);
    expect(matchPlayer(solo, "Morata")).toMatchObject({
      status: "matched",
      playerId: "9",
    });
  });
});
