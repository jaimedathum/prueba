import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FantasySession,
  buildAuthorizeUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  extractAuthorizationCode,
  getB2CConfig,
  getInteractiveConfig,
  loginWithPassword,
  refreshAccessToken,
  tokenUrlWithPolicy,
  type StoredToken,
  type TokenStore,
} from "./auth";

/**
 * Estos tests fijan el fallo que hacía parecer que la API estaba cerrada:
 * exigíamos `access_token` cuando B2C, con scope `openid`, devuelve `id_token`
 * y puede no mandar `access_token` en absoluto. Un login correcto reventaba.
 */

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Sustituye el fetch global y devuelve el espía para inspeccionar el cuerpo. */
function stubFetch(response: Response) {
  const spy = vi.fn(async () => response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function bodyOf(spy: ReturnType<typeof stubFetch>): URLSearchParams {
  const [, init] = spy.mock.calls[0]! as unknown as [string, RequestInit];
  return new URLSearchParams(String(init.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("obtención de token", () => {
  it("usa el id_token como bearer aunque no llegue ningún access_token", async () => {
    stubFetch(
      tokenResponse({
        id_token: "el-id-token",
        refresh_token: "r1",
        id_token_expires_in: 3600,
      }),
    );

    const tokens = await loginWithPassword("yo@ejemplo.com", "clave");

    expect(tokens.bearerToken).toBe("el-id-token");
  });

  it("prefiere el id_token al access_token cuando llegan los dos", async () => {
    stubFetch(
      tokenResponse({
        access_token: "el-access-token",
        id_token: "el-id-token",
        refresh_token: "r1",
        expires_in: 3600,
      }),
    );

    const tokens = await loginWithPassword("yo@ejemplo.com", "clave");

    expect(tokens.bearerToken).toBe("el-id-token");
  });

  it("cae al access_token si el tenant deja de mandar id_token", async () => {
    stubFetch(
      tokenResponse({
        access_token: "el-access-token",
        refresh_token: "r1",
        expires_in: 3600,
      }),
    );

    const tokens = await loginWithPassword("yo@ejemplo.com", "clave");

    expect(tokens.bearerToken).toBe("el-access-token");
  });

  it("manda un grant ROPC con el scope que exige B2C", async () => {
    const spy = stubFetch(
      tokenResponse({ id_token: "t", refresh_token: "r", expires_in: 3600 }),
    );

    await loginWithPassword("yo@ejemplo.com", "clave");

    const body = bodyOf(spy);
    const { clientId } = getB2CConfig();
    expect(body.get("grant_type")).toBe("password");
    expect(body.get("username")).toBe("yo@ejemplo.com");
    expect(body.get("response_type")).toBe("id_token");
    // El propio client_id como scope, y offline_access para que haya refresh.
    expect(body.get("scope")).toContain(clientId);
    expect(body.get("scope")).toContain("offline_access");
  });

  it("caduca según id_token_expires_in, con margen de 60s", async () => {
    vi.useFakeTimers();
    const ahora = new Date("2026-08-03T10:00:00Z");
    vi.setSystemTime(ahora);

    stubFetch(
      tokenResponse({
        id_token: "t",
        refresh_token: "r",
        // El genérico miente a propósito: debe ganar el específico.
        expires_in: 99999,
        id_token_expires_in: 3600,
      }),
    );

    const tokens = await refreshAccessToken("r0");

    expect(tokens.expiresAt).toBe(ahora.getTime() + (3600 - 60) * 1000);
    vi.useRealTimers();
  });

  it("falla con el detalle del error cuando B2C rechaza el login", async () => {
    stubFetch(
      tokenResponse(
        { error: "invalid_grant", error_description: "contraseña incorrecta" },
        400,
      ),
    );

    await expect(loginWithPassword("yo@ejemplo.com", "mal")).rejects.toThrow(
      /contraseña incorrecta/,
    );
  });
});

describe("tokenUrlWithPolicy", () => {
  it("añade la política como parámetro p", () => {
    const url = tokenUrlWithPolicy(
      "https://login.laliga.es/tenant/oauth2/v2.0/token",
      "B2C_1A_ResourceOwnerv2",
    );
    expect(new URL(url).searchParams.get("p")).toBe("B2C_1A_ResourceOwnerv2");
  });

  it("respeta la política si la URL ya la trae puesta", () => {
    const url = tokenUrlWithPolicy(
      "https://login.laliga.es/tenant/oauth2/v2.0/token?p=LA_MIA",
      "B2C_1A_ResourceOwnerv2",
    );
    expect(new URL(url).searchParams.get("p")).toBe("LA_MIA");
  });
});

describe("configuración", () => {
  it("trae valores por defecto para que el login se pueda probar sin configurar nada", () => {
    const config = getB2CConfig();
    expect(config.tokenUrl).toMatch(/^https:\/\//);
    expect(config.clientId).not.toBe("");
    expect(config.policy).not.toBe("");
  });

  it("deja que el entorno sobreescriba cualquier parámetro", () => {
    vi.stubEnv("FANTASY_B2C_CLIENT_ID", "mi-client-id");
    vi.stubEnv("FANTASY_B2C_POLICY", "MI_POLITICA");

    const config = getB2CConfig();

    expect(config.clientId).toBe("mi-client-id");
    expect(config.policy).toBe("MI_POLITICA");
    // El scope por defecto se construye con el client_id efectivo.
    expect(config.scope).toContain("mi-client-id");
  });
});

describe("flujo interactivo (cuentas de Google, Apple o Facebook)", () => {
  it("genera un par PKCE S256 distinto cada vez", () => {
    const a = createPkcePair();
    const b = createPkcePair();

    expect(a.verifier).not.toBe(b.verifier);
    // El challenge es el SHA-256 del verifier en base64url.
    const esperado = createHash("sha256").update(a.verifier).digest("base64url");
    expect(a.challenge).toBe(esperado);
    // base64url: sin +, / ni =.
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("pide un authorization code con PKCE y la política interactiva", () => {
    const url = new URL(buildAuthorizeUrl("EL-CHALLENGE"));
    const { policy, clientId, redirectUri } = getInteractiveConfig();

    expect(url.pathname).toMatch(/authorize$/);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("EL-CHALLENGE");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("p")).toBe(policy);
    expect(url.searchParams.get("client_id")).toBe(clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    // Esta política personalizada rechaza prompt=login.
    expect(url.searchParams.has("prompt")).toBe(false);
  });

  it("usa una política distinta de la de contraseña", () => {
    expect(getInteractiveConfig().policy).not.toBe(getB2CConfig().policy);
  });

  it("canjea el código con el verifier y la política interactiva", async () => {
    const spy = stubFetch(
      tokenResponse({ id_token: "t", refresh_token: "r", expires_in: 3600 }),
    );

    await exchangeAuthorizationCode("EL-CODIGO", "EL-VERIFIER");

    const [url] = spy.mock.calls[0]! as unknown as [string];
    expect(new URL(url).searchParams.get("p")).toBe(
      getInteractiveConfig().policy,
    );

    const body = bodyOf(spy);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("EL-CODIGO");
    expect(body.get("code_verifier")).toBe("EL-VERIFIER");
    expect(body.get("redirect_uri")).toBe(getInteractiveConfig().redirectUri);
  });
});

describe("extractAuthorizationCode", () => {
  it("saca el código de la URL de vuelta con esquema nativo", () => {
    expect(
      extractAuthorizationCode(
        "authredirect://com.lfp.laligafantasy?code=ABC123&state=x",
      ),
    ).toBe("ABC123");
  });

  it("también acepta una URL https", () => {
    expect(
      extractAuthorizationCode("https://ejemplo.com/callback?code=ABC123"),
    ).toBe("ABC123");
  });

  it("acepta el código pelado, por si lo copia suelto", () => {
    expect(extractAuthorizationCode("  ABC123  ")).toBe("ABC123");
  });

  it("propaga el error de B2C en vez de decir que no hay código", () => {
    // Si el login falló, el motivo real está en la URL y es lo único útil.
    expect(() =>
      extractAuthorizationCode(
        "authredirect://x?error=access_denied&error_description=El+usuario+cancel%C3%B3",
      ),
    ).toThrow(/cancel/);
  });

  it("devuelve null cuando no hay nada aprovechable", () => {
    expect(extractAuthorizationCode("")).toBeNull();
    expect(extractAuthorizationCode("https://ejemplo.com/?otra=cosa")).toBeNull();
  });
});

describe("FantasySession", () => {
  it("reutiliza el token en memoria y no refresca en cada petición", async () => {
    const spy = stubFetch(
      tokenResponse({ id_token: "t1", refresh_token: "r2", expires_in: 3600 }),
    );
    const store: TokenStore = {
      read: async () => ({ refreshToken: "r1", policy: null }),
      write: async () => {},
    };
    const session = new FantasySession(store);

    expect(await session.getBearerToken()).toBe("t1");
    expect(await session.getBearerToken()).toBe("t1");

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rota el refresh token guardado en cada refresco", async () => {
    stubFetch(
      tokenResponse({ id_token: "t1", refresh_token: "r2", expires_in: 3600 }),
    );
    const escritos: StoredToken[] = [];
    const session = new FantasySession({
      read: async () => ({ refreshToken: "r1", policy: null }),
      write: async (token) => {
        escritos.push(token);
      },
    });

    await session.getBearerToken();

    expect(escritos.map((e) => e.refreshToken)).toEqual(["r2"]);
  });

  it("refresca con la política que emitió el token, no con la de contraseña", async () => {
    // Un refresh token de B2C está atado a su política: si el login fue
    // interactivo y refrescamos con la de contraseña, falla en producción.
    const spy = stubFetch(
      tokenResponse({ id_token: "t1", refresh_token: "r2", expires_in: 3600 }),
    );
    const session = new FantasySession({
      read: async () => ({ refreshToken: "r1", policy: "POLITICA_INTERACTIVA" }),
      write: async () => {},
    });

    await session.getBearerToken();

    const [url] = spy.mock.calls[0]! as unknown as [string];
    expect(new URL(url).searchParams.get("p")).toBe("POLITICA_INTERACTIVA");
  });

  it("conserva la política al rotar el token", async () => {
    stubFetch(
      tokenResponse({ id_token: "t1", refresh_token: "r2", expires_in: 3600 }),
    );
    const escritos: StoredToken[] = [];
    const session = new FantasySession({
      read: async () => ({ refreshToken: "r1", policy: "POLITICA_INTERACTIVA" }),
      write: async (token) => {
        escritos.push(token);
      },
    });

    await session.getBearerToken();

    expect(escritos[0]?.policy).toBe("POLITICA_INTERACTIVA");
  });

  it("explica qué hacer cuando no hay refresh token guardado", async () => {
    const session = new FantasySession({
      read: async () => null,
      write: async () => {},
    });

    await expect(session.getBearerToken()).rejects.toThrow(/setup\/login/);
  });
});
