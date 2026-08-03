import { describe, expect, it, vi } from "vitest";
import { DisallowedRequestError, FantasyClient } from "./client";
import { FantasySession, type TokenStore } from "./auth";
import { endpoints } from "./endpoints";

/** Sesión de mentira: los tests no tocan ni la red de auth ni la base de datos. */
function fakeSession(): FantasySession {
  const store: TokenStore = {
    read: async () => ({ refreshToken: "refresh", policy: null }),
    write: async () => {},
  };
  const session = new FantasySession(store);
  vi.spyOn(session, "getBearerToken").mockResolvedValue("token-de-prueba");
  return session;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(fetchImpl: typeof fetch, overrides = {}) {
  return new FantasyClient({
    session: fakeSession(),
    fetchImpl,
    minIntervalMs: 0,
    sleepImpl: async () => {},
    ...overrides,
  });
}

describe("FantasyClient", () => {
  it("bloquea cualquier ruta fuera de la allowlist antes de tocar la red", async () => {
    const fetchImpl = vi.fn();
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(
      client.get("/v1/competition/1/league/L1/buyout/P7/pay"),
    ).rejects.toBeInstanceOf(DisallowedRequestError);

    // Lo importante: ni siquiera se intentó la petición.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("solo emite peticiones GET", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    const client = makeClient(fetchImpl);

    await client.get(endpoints.me());

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.method).toBe("GET");
  });

  it("añade x-lang=es y el bearer token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    const client = makeClient(fetchImpl);

    await client.get(endpoints.calendar(), { weekNumber: 12 });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("x-lang=es");
    expect(String(url)).toContain("weekNumber=12");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer token-de-prueba",
    });
  });

  it("reintenta con backoff ante 429 y acaba devolviendo el cuerpo", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ jugadores: 3 }));

    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const body = await client.get(endpoints.players());

    expect(body).toEqual({ jugadores: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("no reintenta ante un 4xx que no es 429", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 403));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.get(endpoints.players())).rejects.toThrow(/403/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("vuelca cada respuesta a la capa cruda", async () => {
    const onResponse = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({ a: 1 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch, {
      onResponse,
    });

    await client.get(endpoints.market("L1"));

    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/v1/competition/1/league/L1/market",
        status: 200,
        body: { a: 1 },
      }),
    );
  });

  it("en modo offline valida y registra pero no sale a la red", async () => {
    const fetchImpl = vi.fn();
    const client = makeClient(fetchImpl as unknown as typeof fetch, {
      offline: true,
    });

    await client.get(endpoints.standing("L1"));

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.plannedRequests).toHaveLength(1);
    expect(client.plannedRequests[0]).toContain("/standing");
  });

  it("serializa las peticiones en vez de lanzarlas en paralelo", async () => {
    let concurrentes = 0;
    let maximo = 0;
    const fetchImpl = vi.fn(async () => {
      concurrentes++;
      maximo = Math.max(maximo, concurrentes);
      await new Promise((r) => setTimeout(r, 5));
      concurrentes--;
      return jsonResponse({});
    });

    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await Promise.all([
      client.get(endpoints.players()),
      client.get(endpoints.currentWeek()),
      client.get(endpoints.leagues()),
    ]);

    expect(maximo).toBe(1);
  });
});
