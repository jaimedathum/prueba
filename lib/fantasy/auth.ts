import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authTokens } from "@/lib/db/schema";
import { decryptToken, encryptToken } from "./crypto";

/**
 * Autenticación contra el tenant Azure B2C de LaLiga.
 *
 * Dos cosas que costaron caras y conviene no volver a aprender:
 *
 * 1. **El bearer de la API es el `id_token`, no el `access_token`.** Con scope
 *    `openid` B2C devuelve `id_token` y puede no devolver `access_token`
 *    siquiera. Exigir `access_token` hacía que un login CORRECTO fallara con
 *    "Fallo de autenticación", que se lee como "la API está cerrada" cuando en
 *    realidad estábamos mirando el campo equivocado.
 * 2. **ROPC sigue vivo** en la política `B2C_1A_ResourceOwnerv2`. No hace falta
 *    ni versión web del juego (ya no existe: es solo app móvil) ni un MITM
 *    contra el móvil. La API del juego no depende de la web.
 *
 * Los valores por defecto están tomados de un proyecto de terceros que ataca
 * este mismo juego y NO se han verificado contra la red desde aquí. Es
 * seguro traerlos porque un parámetro mal falla ruidosamente (400/401 en el
 * login), nunca en silencio: no puede contaminar una recomendación. Cualquiera
 * se sobreescribe por entorno. Ver docs/reglas.md.
 *
 * Este módulo es el ÚNICO sitio del proyecto que hace un POST, y va contra el
 * endpoint de token, nunca contra la API del juego. La allowlist de lectura de
 * `client.ts` sigue siendo absoluta.
 */

/** Sin verificar contra la red. Sobreescribibles con FANTASY_B2C_*. */
const DEFAULT_TOKEN_URL =
  "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token";
const DEFAULT_CLIENT_ID = "af88bcff-1157-40a0-b579-030728aacf0b";
const DEFAULT_ROPC_POLICY = "B2C_1A_ResourceOwnerv2";

export interface B2CConfig {
  tokenUrl: string;
  clientId: string;
  scope: string;
  /** Política (user flow) de B2C; viaja como `?p=` en la URL de token. */
  policy: string;
}

export function getB2CConfig(): B2CConfig {
  const clientId = process.env.FANTASY_B2C_CLIENT_ID || DEFAULT_CLIENT_ID;
  return {
    tokenUrl: process.env.FANTASY_B2C_TOKEN_URL || DEFAULT_TOKEN_URL,
    clientId,
    // B2C exige el propio client_id como scope para emitir un token utilizable
    // contra la API; `offline_access` es lo que hace que llegue refresh token.
    scope:
      process.env.FANTASY_B2C_SCOPE ||
      `openid ${clientId} offline_access`,
    policy: process.env.FANTASY_B2C_POLICY || DEFAULT_ROPC_POLICY,
  };
}

/** Añade `?p=<policy>` salvo que la URL ya traiga la política puesta. */
export function tokenUrlWithPolicy(tokenUrl: string, policy: string): string {
  const url = new URL(tokenUrl);
  if (!url.searchParams.has("p") && policy) {
    url.searchParams.set("p", policy);
  }
  return url.toString();
}

export interface TokenResponse {
  /** El que va en `Authorization: Bearer`. Normalmente el `id_token`. */
  bearerToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface RawTokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

async function requestToken(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const { tokenUrl, policy } = getB2CConfig();
  const response = await fetch(tokenUrlWithPolicy(tokenUrl, policy), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const json = (await response.json().catch(() => ({}))) as RawTokenResponse;

  // El id_token manda: es el que la API acepta como bearer. El access_token
  // queda como reserva por si el tenant cambia de criterio.
  const bearerToken = json.id_token ?? json.access_token;

  if (!response.ok || !bearerToken || !json.refresh_token) {
    const detail = json.error_description ?? json.error ?? response.statusText;
    throw new Error(`Fallo de autenticación (${response.status}): ${detail}`);
  }

  const lifetime = json.id_token_expires_in ?? json.expires_in ?? 3600;

  return {
    bearerToken,
    refreshToken: json.refresh_token,
    // Margen de 60s para no usar un token que caduca a mitad de la petición.
    expiresAt: Date.now() + (lifetime - 60) * 1000,
  };
}

/**
 * Login inicial con usuario y contraseña (flujo ROPC de B2C). Se ejecuta una
 * sola vez, en local: después basta el refresh token guardado.
 *
 * Aviso importante: **ROPC solo funciona con cuentas locales de B2C**, es
 * decir, las de email y contraseña. Si tu cuenta del juego es de Google, Apple
 * o Facebook, esto va a fallar y no es un bug: el flujo de contraseña no puede
 * hablar con un proveedor de identidad externo. En ese caso hace falta el
 * flujo interactivo (authorization code + PKCE), que todavía no está
 * implementado aquí.
 */
export const SOCIAL_ACCOUNT_HINT =
  "Si la contraseña es correcta, lo más probable es que tu cuenta del juego " +
  "sea de Google, Apple o Facebook. El login por contraseña (ROPC) solo " +
  "funciona con cuentas locales de email y contraseña; para las sociales hace " +
  "falta el flujo interactivo, todavía sin implementar. Ver docs/reglas.md.";

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<TokenResponse> {
  const { clientId, scope } = getB2CConfig();
  return requestToken({
    grant_type: "password",
    client_id: clientId,
    scope,
    username: email,
    password,
    // `id_token` a secas: es el token que la API acepta como bearer.
    response_type: "id_token",
  });
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const { clientId, scope } = getB2CConfig();
  return requestToken({
    grant_type: "refresh_token",
    client_id: clientId,
    scope,
    refresh_token: refreshToken,
  });
}

/* ------------------------------------------------------------------ *
 * Persistencia del refresh token
 * ------------------------------------------------------------------ */

const SINGLETON_ID = "default";

export interface TokenStore {
  read(): Promise<string | null>;
  write(refreshToken: string): Promise<void>;
}

/** Store real: refresh token cifrado en Postgres. */
export const dbTokenStore: TokenStore = {
  async read() {
    const db = getDb();
    const [row] = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.id, SINGLETON_ID))
      .limit(1);
    if (!row) return null;
    return decryptToken({
      ciphertext: row.encryptedRefreshToken,
      iv: row.iv,
      authTag: row.authTag,
    });
  },

  async write(refreshToken: string) {
    const db = getDb();
    const encrypted = encryptToken(refreshToken);
    await db
      .insert(authTokens)
      .values({
        id: SINGLETON_ID,
        encryptedRefreshToken: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      .onConflictDoUpdate({
        target: authTokens.id,
        set: {
          encryptedRefreshToken: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          updatedAt: new Date(),
        },
      });
  },
};

/**
 * Sesión: mantiene un access token vivo, refrescándolo cuando caduca y
 * rotando el refresh token guardado.
 */
export class FantasySession {
  private bearerToken: string | null = null;
  private expiresAt = 0;
  private inFlight: Promise<string> | null = null;

  constructor(private readonly store: TokenStore = dbTokenStore) {}

  /**
   * Token para `Authorization: Bearer`. Se llama así, y no `getAccessToken`,
   * porque lo que devuelve es el `id_token`: confundir ambos fue justo el bug
   * que hacía parecer que la API estaba cerrada.
   */
  async getBearerToken(): Promise<string> {
    if (this.bearerToken && Date.now() < this.expiresAt) {
      return this.bearerToken;
    }
    // Varias peticiones concurrentes comparten un único refresco.
    this.inFlight ??= this.refresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refresh(): Promise<string> {
    const stored = await this.store.read();
    if (!stored) {
      throw new Error(
        "No hay refresh token guardado. Ejecuta `npm run sync -- --login` una vez para iniciar sesión.",
      );
    }
    const tokens = await refreshAccessToken(stored);
    await this.store.write(tokens.refreshToken);
    this.bearerToken = tokens.bearerToken;
    this.expiresAt = tokens.expiresAt;
    return tokens.bearerToken;
  }

  /** Guarda la sesión tras un login con contraseña. */
  async adopt(tokens: TokenResponse): Promise<void> {
    await this.store.write(tokens.refreshToken);
    this.bearerToken = tokens.bearerToken;
    this.expiresAt = tokens.expiresAt;
  }
}
