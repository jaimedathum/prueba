import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { safeEqual } from "@/lib/fantasy/crypto";

/**
 * Puerta única de las acciones privilegiadas.
 *
 * Antes cada acción comprobaba `CRON_SECRET` por su cuenta —y dos no
 * comprobaban nada—, así que el criterio vivía copiado en cinco sitios. Aquí
 * está una sola vez, que además es donde habrá que enchufar la sesión de
 * usuario de verdad cuando la app deje de ser de un solo dueño.
 *
 * **Por qué hay cookie y no solo secreto.** El botón de sincronizar de la
 * cabecera se usa varias veces al día, justo después de mover algo en la app
 * oficial. Pedir el secreto en cada pulsación lo haría inservible y la
 * tentación sería quitarle la protección otra vez. Así que el secreto se
 * teclea **una vez** —en cualquiera de los formularios de `/setup`— y a partir
 * de ahí este navegador queda desbloqueado.
 *
 * La cookie es httpOnly y va firmada con HMAC-SHA256 usando el propio
 * `CRON_SECRET` como clave: no hay que configurar nada nuevo, y **rotar el
 * secreto invalida de golpe todas las sesiones**, que es exactamente lo que se
 * quiere el día que se sospeche una filtración.
 */

export const ADMIN_COOKIE = "fa_admin";

/**
 * 30 días. Una temporada entera sin volver a teclearlo sería demasiado; pedir
 * el secreto cada semana, un incordio que acabaría en "mejor lo quito".
 */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type GateResult = { ok: true } | { ok: false; message: string };

const MISSING_SECRET_MESSAGE =
  "CRON_SECRET no está configurado en el despliegue. Añádelo en " +
  "Vercel → Settings → Environment Variables y vuelve a desplegar.";

/** Genérico a propósito: no confirma si el secreto existe ni cuánto mide. */
const WRONG_SECRET_MESSAGE = "Secreto incorrecto.";

export const LOCKED_MESSAGE =
  "Bloqueado. Introduce el secreto una vez en /setup y este navegador queda " +
  "desbloqueado durante 30 días.";

/* ------------------------------------------------------------------ *
 * Firma de la sesión — puro, y por eso testeable sin cookies ni red
 * ------------------------------------------------------------------ */

export function signSession(expiresAtMs: number, key: string): string {
  const payload = String(Math.trunc(expiresAtMs));
  const mac = createHmac("sha256", key).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifySession(
  value: string,
  key: string,
  nowMs: number,
): boolean {
  const separator = value.indexOf(".");
  if (separator <= 0) return false;

  const payload = value.slice(0, separator);
  const mac = value.slice(separator + 1);

  // Primero la firma: si no es nuestra, la fecha que traiga da igual.
  const expected = createHmac("sha256", key).update(payload).digest("hex");
  if (!safeEqual(mac, expected)) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;
  return nowMs < expiresAt;
}

/* ------------------------------------------------------------------ *
 * Uso desde acciones y componentes de servidor
 * ------------------------------------------------------------------ */

function adminKey(): string | null {
  const value = process.env.CRON_SECRET;
  return value ? value : null;
}

/** Comprueba el secreto tecleado en un formulario. */
export function checkAdminSecret(provided: string): GateResult {
  const key = adminKey();
  if (!key) return { ok: false, message: MISSING_SECRET_MESSAGE };
  if (!safeEqual(provided, key)) {
    return { ok: false, message: WRONG_SECRET_MESSAGE };
  }
  return { ok: true };
}

/**
 * Marca este navegador como desbloqueado. Solo se puede llamar desde una
 * server action o un route handler: en un componente de servidor, Next no
 * deja escribir cookies.
 */
export async function grantAdminSession(now = Date.now()): Promise<void> {
  const key = adminKey();
  if (!key) return;

  (await cookies()).set(ADMIN_COOKIE, signSession(now + SESSION_TTL_SECONDS * 1000, key), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function hasAdminSession(now = Date.now()): Promise<boolean> {
  const key = adminKey();
  if (!key) return false;

  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return value ? verifySession(value, key, now) : false;
}

/** Lo que llama una acción privilegiada antes de tocar nada. */
export async function requireAdminSession(): Promise<GateResult> {
  if (!adminKey()) return { ok: false, message: MISSING_SECRET_MESSAGE };
  if (!(await hasAdminSession())) {
    return { ok: false, message: LOCKED_MESSAGE };
  }
  return { ok: true };
}
