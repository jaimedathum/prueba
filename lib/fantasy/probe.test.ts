import { describe, expect, it, vi } from "vitest";
import { FantasySession } from "./auth";
import { API_BASE } from "./endpoints";
import { candidateBases, diagnoseApi } from "./probe";

/**
 * El diagnóstico solo vale si separa las causas. Decir "404" ya lo hacía la
 * sincronización; lo que hacía falta es saber si sobra un prefijo, si falta,
 * o si el identificador de competición no es el que toca.
 */

function fakeSession(): FantasySession {
  const session = new FantasySession({
    read: async () => ({ refreshToken: "r", policy: null }),
    write: async () => {},
  });
  vi.spyOn(session, "getBearerToken").mockResolvedValue("token");
  return session;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Responde 200 solo a las URLs que empiecen por `working`. */
function fetchOnly(working: string, extra: Record<string, number> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    for (const [fragment, status] of Object.entries(extra)) {
      if (url.includes(fragment)) return json({}, status);
    }
    return url.startsWith(working)
      ? json({ teams: [{ id: "T1" }] })
      : json({ error: "not found" }, 404);
  }) as unknown as typeof fetch;
}

describe("candidateBases", () => {
  it("prueba con y sin el sufijo /api", () => {
    const bases = candidateBases("https://ejemplo.com");
    expect(bases).toContain("https://ejemplo.com");
    expect(bases).toContain("https://ejemplo.com/api");
  });

  it("también funciona partiendo de una base que ya lleva /api", () => {
    const bases = candidateBases("https://ejemplo.com/api");
    expect(bases).toContain("https://ejemplo.com/api");
    expect(bases).toContain("https://ejemplo.com");
  });

  it("empieza por la configurada y no repite ninguna", () => {
    const bases = candidateBases("https://ejemplo.com/api");
    expect(bases[0]).toBe("https://ejemplo.com/api");
    expect(new Set(bases).size).toBe(bases.length);
  });
});

describe("diagnoseApi", () => {
  it("identifica que falta el prefijo /api", async () => {
    const base = `${API_BASE}/api`;
    const diagnosis = await diagnoseApi({
      session: fakeSession(),
      fetchImpl: fetchOnly(base),
    });

    expect(diagnosis.workingBase).toBe(base);
    expect(diagnosis.conclusion).toContain("FANTASY_API_BASE");
  });

  it("señala el identificador de competición cuando la base sí funciona", async () => {
    // /v4/user/me responde bien pero /leagues no: no es la base, es el id.
    const diagnosis = await diagnoseApi({
      session: fakeSession(),
      fetchImpl: fetchOnly(API_BASE, { "/leagues": 404 }),
    });

    expect(diagnosis.workingBase).toBe(API_BASE);
    expect(diagnosis.conclusion).toContain("FANTASY_COMPETITION_ID");
  });

  it("no confunde un token caducado con una ruta equivocada", async () => {
    const diagnosis = await diagnoseApi({
      session: fakeSession(),
      fetchImpl: vi.fn(async () => json({}, 401)) as unknown as typeof fetch,
    });

    expect(diagnosis.workingBase).toBeNull();
    expect(diagnosis.conclusion).toMatch(/token/i);
    expect(diagnosis.conclusion).toContain("/setup/login");
  });

  it("devuelve la respuesta de /v4/user/me para sacar liga y equipo", async () => {
    const diagnosis = await diagnoseApi({
      session: fakeSession(),
      fetchImpl: fetchOnly(API_BASE),
    });

    expect(diagnosis.me).toEqual({ teams: [{ id: "T1" }] });
  });

  it("dice que la API ha cambiado si ninguna base responde", async () => {
    const diagnosis = await diagnoseApi({
      session: fakeSession(),
      fetchImpl: vi.fn(async () => json({}, 404)) as unknown as typeof fetch,
    });

    expect(diagnosis.workingBase).toBeNull();
    expect(diagnosis.conclusion).toMatch(/ninguna base/i);
  });
});
