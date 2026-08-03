import { describe, expect, it } from "vitest";
import { checkSetupEnv } from "./setup-status";

/**
 * El panel de configuración solo vale si distingue los modos de fallo. Decir
 * "falta" cuando en realidad sobra una comilla manda a buscar en el sitio
 * equivocado, que es justo lo que se quiere evitar.
 */

const CLAVE_VALIDA = "a".repeat(64);

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://u:p@host/db",
    TOKEN_ENCRYPTION_KEY: CLAVE_VALIDA,
    CRON_SECRET: "un-secreto-largo",
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
}

function find(checks: ReturnType<typeof checkSetupEnv>, name: string) {
  return checks.find((check) => check.name === name)!;
}

describe("checkSetupEnv", () => {
  it("da por buena una configuración completa", () => {
    expect(checkSetupEnv(env()).every((check) => check.ok)).toBe(true);
  });

  it("nunca devuelve el valor de una variable", () => {
    const secreto = "un-secreto-largo";
    const serializado = JSON.stringify(checkSetupEnv(env()));

    expect(serializado).not.toContain(secreto);
    expect(serializado).not.toContain(CLAVE_VALIDA);
  });

  it("detecta cada variable ausente por separado", () => {
    expect(find(checkSetupEnv(env({ DATABASE_URL: "" })), "DATABASE_URL").ok).toBe(
      false,
    );
    expect(
      find(checkSetupEnv(env({ CRON_SECRET: "" })), "CRON_SECRET").ok,
    ).toBe(false);
    expect(
      find(checkSetupEnv(env({ TOKEN_ENCRYPTION_KEY: "" })), "TOKEN_ENCRYPTION_KEY")
        .ok,
    ).toBe(false);
  });

  it("acepta POSTGRES_URL como alias de la base de datos", () => {
    const sinDatabaseUrl = env({ DATABASE_URL: "" });
    sinDatabaseUrl.POSTGRES_URL = "postgresql://u:p@host/db";

    expect(find(checkSetupEnv(sinDatabaseUrl), "DATABASE_URL").ok).toBe(true);
  });

  it("distingue una clave con comillas de una clave ausente", () => {
    const check = find(
      checkSetupEnv(env({ TOKEN_ENCRYPTION_KEY: `"${CLAVE_VALIDA}"` })),
      "TOKEN_ENCRYPTION_KEY",
    );

    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/hexadecimales/i);
  });

  it("distingue una clave de longitud incorrecta", () => {
    const check = find(
      checkSetupEnv(env({ TOKEN_ENCRYPTION_KEY: "abcdef" })),
      "TOKEN_ENCRYPTION_KEY",
    );

    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/64 caracteres/);
    expect(check.detail).toMatch(/tiene 6/);
  });
});
