import { describe, expect, it } from "vitest";
import { parseManager, parseMatch, parseTeamBalance } from "./parse";

/**
 * Formas reales de la API, capturadas del informe de mapeo del 2026-08-04.
 *
 * Las dos entidades que se perdían enteras lo hacían por lo mismo: un `return`
 * temprano por un campo que no se encontraba. En el caso del manager, además,
 * ese campo era **cosmético**, y perder el manager vaciaba la liga entera —y
 * con ella plantillas, snapshots y caja—.
 */

describe("parseManager", () => {
  /** Entrada de /standing tal y como llega: sin ningún alias de nombre. */
  const ENTRADA_REAL = {
    id: "017875406T1",
    position: 1,
    previousPosition: 0,
    points: 0,
    livePoints: 0,
  };

  it("no pierde el manager porque falte el nombre del equipo", () => {
    const { manager } = parseManager(ENTRADA_REAL, "L1");

    expect(manager).not.toBeNull();
    expect(manager?.id).toBe("017875406T1");
  });

  it("lee los campos que quedaban detrás del return temprano", () => {
    const { manager } = parseManager(ENTRADA_REAL, "L1");

    // Antes salían como "sin usar" en el informe: nunca se llegaba a pedirlos.
    expect(manager?.position).toBe(1);
    expect(manager?.points).toBe(0);
  });

  it("usa el nombre de manager como nombre de equipo cuando no hay otro", () => {
    const { manager } = parseManager(
      { ...ENTRADA_REAL, managerName: "chachesinhonor" },
      "L1",
    );

    expect(manager?.teamName).toBe("chachesinhonor");
    expect(manager?.managerName).toBe("chachesinhonor");
  });

  it("prefiere el nombre del equipo cuando llega, por cualquier alias", () => {
    for (const raw of [
      { ...ENTRADA_REAL, teamName: "Los Cracks" },
      { ...ENTRADA_REAL, team: { teamName: "Los Cracks" } },
      { ...ENTRADA_REAL, name: "Los Cracks" },
    ]) {
      expect(parseManager(raw, "L1").manager?.teamName).toBe("Los Cracks");
    }
  });

  it("sigue descartando una entrada sin id: sin eso no hay entidad", () => {
    expect(parseManager({ position: 1 }, "L1").manager).toBeNull();
  });
});

describe("parseMatch", () => {
  /** Entrada del calendario tal y como llega: ids planos, no anidados. */
  const PARTIDO_REAL = {
    id: "M1",
    localId: "T1",
    visitorId: "T2",
    localScore: 2,
    visitorScore: 1,
    matchState: "Finalizado",
    matchDate: "2026-08-15T19:00:00Z",
  };

  it("encuentra los equipos por localId y visitorId", () => {
    const { match } = parseMatch(PARTIDO_REAL, 1);

    expect(match?.homeTeamId).toBe("T1");
    expect(match?.awayTeamId).toBe("T2");
  });

  it("lee el resultado, que quedaba detrás del return temprano", () => {
    const { match } = parseMatch(PARTIDO_REAL, 1);

    expect(match?.homeGoals).toBe(2);
    expect(match?.awayGoals).toBe(1);
    expect(match?.finished).toBe(true);
  });

  it("no da por jugado un partido sin resultado", () => {
    // Un 0-0 sin jugar y un 0-0 real no son lo mismo para el modelo.
    const { match } = parseMatch(
      { localId: "T1", visitorId: "T2", matchState: "Pendiente" },
      1,
    );

    expect(match?.finished).toBe(false);
  });

  it("sigue aceptando la forma anidada por si vuelve", () => {
    const { match } = parseMatch(
      { local: { id: "T1" }, visitor: { id: "T2" } },
      1,
    );

    expect(match?.homeTeamId).toBe("T1");
  });
});

describe("parseTeamBalance", () => {
  it("saca el saldo del detalle del equipo", () => {
    expect(parseTeamBalance({ teamMoney: 100_000_000 })).toBe(100_000_000);
  });

  it("acepta los alias plausibles", () => {
    expect(parseTeamBalance({ money: 5 })).toBe(5);
    expect(parseTeamBalance({ team: { teamMoney: 7 } })).toBe(7);
  });

  it("devuelve null para un rival, cuyo saldo no es visible", () => {
    // Correcto y esperado: justo por eso existe el motor que lo estima.
    expect(parseTeamBalance({ players: [] })).toBeNull();
    expect(parseTeamBalance(null)).toBeNull();
  });

  it("no confunde un saldo de cero con un saldo ausente", () => {
    // Arruinado y sin datos no son lo mismo: uno acota la caja, el otro no.
    expect(parseTeamBalance({ teamMoney: 0 })).toBe(0);
  });
});
