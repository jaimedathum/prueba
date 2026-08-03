"use server";

import { cookies } from "next/headers";
import {
  FantasySession,
  SOCIAL_ACCOUNT_HINT,
  buildAuthorizeUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  extractAuthorizationCode,
  getInteractiveConfig,
  loginWithPassword,
} from "@/lib/fantasy/auth";
import { decryptToken, encryptToken, safeEqual } from "@/lib/fantasy/crypto";

/**
 * Login inicial desde el navegador.
 *
 * Existe porque el flujo normal —`npm run sync -- --login`— exige una terminal
 * con el repositorio clonado, y este proyecto se puede operar entero desde
 * Vercel y GitHub. Corriendo dentro del despliegue hay salida a LaLiga y a la
 * base de datos, que es justo lo que hace falta.
 *
 * Hay dos caminos porque el juego admite dos tipos de cuenta:
 *
 * - **Contraseña (ROPC)**: solo sirve para cuentas locales.
 * - **Interactivo (authorization code + PKCE)**: el único que vale para
 *   Google, Apple o Facebook.
 *
 * Tres decisiones de seguridad comunes a ambos:
 *
 * - **Las credenciales no se guardan en ningún sitio.** En el interactivo ni
 *   siquiera pasan por aquí: se tecleen donde se tecleen, es en LaLiga.
 * - **Las acciones van protegidas por `CRON_SECRET`**, comparado en tiempo
 *   constante. Es una URL pública: sin esto, cualquiera podría usarla como
 *   oráculo de login contra LaLiga.
 * - **Nunca se registra ni se devuelve el token.**
 *
 * Esto no rompe la garantía de solo-lectura: sigue sin haber ninguna ruta que
 * puje, clausule ni blinde. La allowlist de `lib/fantasy/endpoints.ts` no se
 * toca.
 */

export interface LoginState {
  ok: boolean;
  message: string;
  /** Presente solo al arrancar el flujo interactivo. */
  authorizeUrl?: string;
}

/**
 * Mensaje de éxito, compartido por los dos flujos.
 *
 * Dice explícitamente que falta un paso porque la versión anterior —"a partir
 * de ahora el despliegue se mantiene solo"— se leía como "ya está", y dejaba
 * al usuario mirando una app vacía sin saber que nadie había traído los datos
 * todavía. Iniciar sesión y sincronizar son cosas distintas.
 */
const LOGGED_IN_MESSAGE =
  "Sesión iniciada. El refresh token está guardado cifrado en la base de " +
  "datos, junto con la política que lo emitió, y tus credenciales no se han " +
  "almacenado en ninguna parte.\n\n" +
  "FALTA UN PASO: la base de datos sigue vacía. Ve a /setup y pulsa " +
  "«Sincronizar» para traer los primeros datos. Hasta entonces la app se verá " +
  "en blanco. Después ya se mantiene sola con el cron diario.";

const VERIFIER_COOKIE = "fa_pkce";
/** El usuario tiene que ir a LaLiga y volver; 15 minutos sobran. */
const VERIFIER_TTL_SECONDS = 15 * 60;

function authorize(formData: FormData): LoginState | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return {
      ok: false,
      message:
        "CRON_SECRET no está configurado en el despliegue. Añádelo en " +
        "Vercel → Settings → Environment Variables y vuelve a desplegar.",
    };
  }
  if (!safeEqual(String(formData.get("secret") ?? ""), expected)) {
    // Mensaje genérico a propósito: no confirma si el secreto existe.
    return { ok: false, message: "Secreto incorrecto." };
  }
  return null;
}

/* ---------------------------- contraseña ---------------------------- */

export async function loginAction(
  _previous: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const denied = authorize(formData);
  if (denied) return denied;

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, message: "Faltan el email o la contraseña." };
  }

  try {
    const tokens = await loginWithPassword(email, password);
    await new FantasySession().adopt(tokens);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `${detail}\n\n${SOCIAL_ACCOUNT_HINT}` };
  }

  return { ok: true, message: LOGGED_IN_MESSAGE };
}

/* ---------------------------- interactivo --------------------------- */

/**
 * Paso 1: genera el par PKCE y devuelve la URL de LaLiga.
 *
 * El verifier viaja en una cookie httpOnly y **cifrado** con la misma clave
 * que el refresh token. Podría ir en claro —solo sirve junto al código, que lo
 * tiene el usuario— pero teniendo ya la primitiva, no cifrarlo sería gratuito
 * solo para el atacante.
 */
export async function startInteractiveLogin(
  _previous: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const denied = authorize(formData);
  if (denied) return denied;

  const { verifier, challenge } = createPkcePair();
  const encrypted = encryptToken(verifier);

  (await cookies()).set(
    VERIFIER_COOKIE,
    JSON.stringify(encrypted),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: VERIFIER_TTL_SECONDS,
      path: "/setup/login",
    },
  );

  return {
    ok: true,
    authorizeUrl: buildAuthorizeUrl(challenge),
    message:
      "Abre el enlace, identifícate con tu proveedor y vuelve aquí con la URL " +
      "de destino. Tienes 15 minutos.",
  };
}

/** Paso 2: canjea el código que ha pegado el usuario. */
export async function completeInteractiveLogin(
  _previous: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const denied = authorize(formData);
  if (denied) return denied;

  const jar = await cookies();
  const stored = jar.get(VERIFIER_COOKIE)?.value;
  if (!stored) {
    return {
      ok: false,
      message:
        "No hay un login interactivo en curso, o han pasado más de 15 " +
        "minutos. Vuelve a empezar por el paso 1.",
    };
  }

  let verifier: string;
  try {
    verifier = decryptToken(JSON.parse(stored));
  } catch {
    return {
      ok: false,
      message: "El login en curso no se puede leer. Empieza otra vez por el paso 1.",
    };
  }

  let code: string | null;
  try {
    code = extractAuthorizationCode(String(formData.get("redirected") ?? ""));
  } catch (error) {
    // B2C devuelve el motivo real en la URL cuando el login falla.
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (!code) {
    return {
      ok: false,
      message:
        "No se ha encontrado ningún código ahí. Pega la URL entera a la que " +
        "te redirigió LaLiga, la que empieza por authredirect://",
    };
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, verifier);
    await new FantasySession().adopt(tokens, getInteractiveConfig().policy);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  // El verifier ya no vale para nada: fuera.
  jar.delete(VERIFIER_COOKIE);

  return { ok: true, message: LOGGED_IN_MESSAGE };
}
