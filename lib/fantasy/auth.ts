import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authTokens } from "@/lib/db/schema";
import { decryptToken, encryptToken } from "./crypto";

/**
 * Autenticación contra el tenant Azure B2C de LaLiga.
 *
 * Los cuatro parámetros del tenant (host, política, client_id y scope) no se
 * hardcodean porque no se han verificado todavía: se obtienen en la fase 0
 * observando la petición de login de la app oficial y se documentan en
 * docs/reglas.md. Hasta entonces la app falla con un mensaje claro en vez de
 * intentar adivinarlos.
 *
 * Este módulo es el ÚNICO sitio del proyecto que hace un POST, y va contra el
 * endpoint de token, nunca contra la API del juego. La allowlist de lectura de
 * `client.ts` sigue siendo absoluta.
 */

export interface B2CConfig {
  tokenUrl: string;
  clientId: string;
  scope: string;
}

export function getB2CConfig(): B2CConfig {
  const tokenUrl = process.env.FANTASY_B2C_TOKEN_URL;
  const clientId = process.env.FANTASY_B2C_CLIENT_ID;
  const scope = process.env.FANTASY_B2C_SCOPE;

  if (!tokenUrl || !clientId || !scope) {
    throw new Error(
      "Faltan FANTASY_B2C_TOKEN_URL, FANTASY_B2C_CLIENT_ID o FANTASY_B2C_SCOPE. " +
        "Se obtienen en la fase 0 observando el login de la app oficial; " +
        "ver docs/reglas.md.",
    );
  }
  return { tokenUrl, clientId, scope };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function requestToken(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const { tokenUrl } = getB2CConfig();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const json = (await response.json().catch(() => ({}))) as RawTokenResponse;

  if (!response.ok || !json.access_token || !json.refresh_token) {
    const detail = json.error_description ?? json.error ?? response.statusText;
    throw new Error(`Fallo de autenticación (${response.status}): ${detail}`);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    // Margen de 60s para no usar un token que caduca a mitad de la petición.
    expiresAt: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000,
  };
}

/**
 * Login inicial con usuario y contraseña (flujo ROPC de B2C). Se ejecuta una
 * sola vez, en local: después basta el refresh token guardado.
 */
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
    response_type: "token id_token",
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
  private accessToken: string | null = null;
  private expiresAt = 0;
  private inFlight: Promise<string> | null = null;

  constructor(private readonly store: TokenStore = dbTokenStore) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
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
    this.accessToken = tokens.accessToken;
    this.expiresAt = tokens.expiresAt;
    return tokens.accessToken;
  }

  /** Guarda la sesión tras un login con contraseña. */
  async adopt(tokens: TokenResponse): Promise<void> {
    await this.store.write(tokens.refreshToken);
    this.accessToken = tokens.accessToken;
    this.expiresAt = tokens.expiresAt;
  }
}
