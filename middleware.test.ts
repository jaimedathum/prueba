import { afterEach, describe, expect, it } from "vitest";
import { isPublicPath } from "./middleware";
import { configuredProviders } from "@/lib/auth-providers";

/**
 * La lista de rutas abiertas es la superficie de ataque entera de la
 * aplicación. Revisarla leyendo no sirve: el error típico —un `startsWith`
 * sin barra— no se ve mirando, se ve probándolo.
 */
describe("isPublicPath", () => {
  it("deja pasar lo que tiene que estar abierto", () => {
    for (const path of [
      "/login",
      "/api/auth/signin",
      "/api/auth/callback/google",
      "/api/cron/sync",
      "/api/cron/alerts",
      "/setup",
      "/setup/login",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("cierra todo lo que enseña datos de la liga", () => {
    for (const path of [
      "/",
      "/mercado",
      "/alineacion",
      "/riesgo",
      "/rivales",
      "/rivales/m123",
      "/overrides",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  /**
   * El fallo clásico de este patrón: con `startsWith` a secas, cualquier ruta
   * que **empiece igual** que una pública queda abierta sin quererlo.
   */
  it("no abre rutas que solo comparten prefijo", () => {
    for (const path of [
      "/setupfalso",
      "/loginmentira",
      "/api/authorization",
      "/api/cronjobs",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});

describe("configuredProviders", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("no activa nada sin configuración", () => {
    expect(
      configuredProviders({} as unknown as NodeJS.ProcessEnv),
    ).toEqual({ google: false, email: false });
  });

  /** Media pareja no vale: un client_id sin secreto solo produce un error. */
  it("exige las dos variables de cada proveedor", () => {
    expect(
      configuredProviders({ AUTH_GOOGLE_ID: "x" } as unknown as NodeJS.ProcessEnv).google,
    ).toBe(false);
    expect(
      configuredProviders({ EMAIL_FROM: "a@b.c" } as unknown as NodeJS.ProcessEnv).email,
    ).toBe(false);
  });

  it("activa cada uno cuando está completo", () => {
    expect(
      configuredProviders({
        AUTH_GOOGLE_ID: "x",
        AUTH_GOOGLE_SECRET: "y",
      } as unknown as NodeJS.ProcessEnv).google,
    ).toBe(true);

    expect(
      configuredProviders({
        EMAIL_SERVER: "smtp://…",
        EMAIL_FROM: "a@b.c",
      } as unknown as NodeJS.ProcessEnv).email,
    ).toBe(true);
  });
});
