import { findDatabaseUrl } from "@/lib/db/config";

/**
 * Qué variables ve el servidor **en ejecución**.
 *
 * Existe porque "la tengo configurada en Vercel" y "el proceso que atiende la
 * petición la ve" no son lo mismo, y distinguirlo a ciegas es horrible: una
 * variable añadida después del último build, o marcada solo para Production
 * mientras se navega por la URL de preview, produce exactamente el mismo error
 * que no haberla puesto nunca.
 *
 * **Nunca devuelve valores**, solo si están y si tienen buena pinta. Se puede
 * enseñar en una página sin miedo.
 */

export interface EnvCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Bytes que espera AES-256-GCM, en hex. Igual que en `crypto.ts`. */
const KEY_HEX_LENGTH = 64;

function checkEncryptionKey(env: NodeJS.ProcessEnv): EnvCheck {
  const value = env.TOKEN_ENCRYPTION_KEY;
  if (!value) {
    return {
      name: "TOKEN_ENCRYPTION_KEY",
      ok: false,
      detail: "No la ve el servidor.",
    };
  }
  if (!/^[0-9a-fA-F]+$/.test(value)) {
    return {
      name: "TOKEN_ENCRYPTION_KEY",
      ok: false,
      detail: "Tiene caracteres que no son hexadecimales. ¿Comillas de más?",
    };
  }
  if (value.length !== KEY_HEX_LENGTH) {
    return {
      name: "TOKEN_ENCRYPTION_KEY",
      ok: false,
      detail: `Debe tener ${KEY_HEX_LENGTH} caracteres hex y tiene ${value.length}.`,
    };
  }
  return { name: "TOKEN_ENCRYPTION_KEY", ok: true, detail: "Correcta." };
}

export function checkSetupEnv(env: NodeJS.ProcessEnv = process.env): EnvCheck[] {
  return [
    {
      name: "DATABASE_URL",
      ok: findDatabaseUrl(env) !== null,
      detail: findDatabaseUrl(env)
        ? "Correcta."
        : "No la ve el servidor. Sin ella no se puede guardar el token.",
    },
    checkEncryptionKey(env),
    {
      name: "CRON_SECRET",
      ok: Boolean(env.CRON_SECRET),
      detail: env.CRON_SECRET
        ? "Correcta."
        : "No la ve el servidor. Es la que pide el formulario.",
    },
  ];
}
