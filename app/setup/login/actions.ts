"use server";

import {
  FantasySession,
  SOCIAL_ACCOUNT_HINT,
  loginWithPassword,
} from "@/lib/fantasy/auth";
import { safeEqual } from "@/lib/fantasy/crypto";

/**
 * Login inicial desde el navegador.
 *
 * Existe porque el flujo normal —`npm run sync -- --login`— exige una terminal
 * con el repositorio clonado, y este proyecto se puede operar entero desde
 * Vercel y GitHub. Corriendo dentro del despliegue hay salida a LaLiga y a la
 * base de datos, que es justo lo que hace falta.
 *
 * Tres decisiones de seguridad:
 *
 * - **Las credenciales no se guardan en ningún sitio.** Llegan por el formulario,
 *   se usan para pedir el token y se van con la petición. En particular NO hay
 *   que subirlas como variables de entorno a Vercel; lo único que queda es el
 *   refresh token, cifrado en Postgres.
 * - **La acción va protegida por `CRON_SECRET`**, comparado en tiempo constante.
 *   Es una URL pública: sin esto, cualquiera podría usarla como oráculo de
 *   login contra LaLiga.
 * - **Nunca se registra ni se devuelve el token**, ni la contraseña.
 *
 * Esto no rompe la garantía de solo-lectura: sigue sin haber ninguna ruta que
 * puje, clausule ni blinde. La allowlist de `lib/fantasy/endpoints.ts` no se
 * toca.
 */

export interface LoginState {
  ok: boolean;
  message: string;
}

export async function loginAction(
  _previous: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const secret = String(formData.get("secret") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return {
      ok: false,
      message:
        "CRON_SECRET no está configurado en el despliegue. Añádelo en " +
        "Vercel → Settings → Environment Variables y vuelve a desplegar.",
    };
  }

  if (!safeEqual(secret, expected)) {
    // Mensaje genérico a propósito: no confirma si el secreto existe.
    return { ok: false, message: "Secreto incorrecto." };
  }

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

  return {
    ok: true,
    message:
      "Sesión iniciada. El refresh token ya está guardado cifrado en la base " +
      "de datos. Tu contraseña no se ha almacenado en ningún sitio: a partir " +
      "de ahora el despliegue se refresca solo.",
  };
}
