import { DEFAULT_ACCOUNT_ID } from "@/lib/tenant";
import { FantasySession } from "./auth";
import { API_BASE, COMPETITION_ID, endpoints, isAllowedPath } from "./endpoints";

/**
 * Diagnóstico de la API.
 *
 * Un `404` en todas las rutas no dice qué está mal: puede ser el prefijo de la
 * URL base —que nunca se ha podido confirmar— o un `COMPETITION_ID` que no es
 * el que toca. Distinguirlo probando a ciegas cuesta un despliegue por
 * intento, así que esto lo resuelve en una pasada.
 *
 * La clave está en `/v4/user/me`, que **no lleva id de competición**:
 *
 * - Si responde 200, la base y el token son correctos, y el problema está en
 *   el `COMPETITION_ID`.
 * - Si responde 404 con todas las bases, el problema es la base.
 * - Si responde 401, el token no vale y hay que volver a iniciar sesión.
 *
 * Sigue siendo solo lectura: pasa por la misma allowlist que el cliente
 * normal y solo pide rutas que ya estaban permitidas.
 */

export interface ProbeResult {
  base: string;
  path: string;
  status: number | null;
  error?: string;
  /** Solo para la ruta que funciona: sirve para sacar liga y equipo. */
  body?: unknown;
}

export interface ApiDiagnosis {
  results: ProbeResult[];
  /** Base que respondió 200 a `/v4/user/me`, si alguna. */
  workingBase: string | null;
  /** Respuesta de `/v4/user/me` con la base que funciona. */
  me: unknown;
  conclusion: string;
}

/** Las dos formas que puede tener la base, con y sin el sufijo `/api`. */
export function candidateBases(base = API_BASE): string[] {
  const trimmed = base.replace(/\/$/, "");
  const stripped = trimmed.replace(/\/api$/, "");
  // La configurada primero: si el usuario la ha fijado, es la que más pesa.
  return [...new Set([trimmed, `${stripped}/api`, stripped])];
}

async function probe(
  base: string,
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<ProbeResult> {
  if (!isAllowedPath(path)) {
    return { base, path, status: null, error: "Ruta fuera de la allowlist" };
  }

  try {
    const response = await fetchImpl(`${base}${path}?x-lang=es`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    const body =
      response.ok ? await response.json().catch(() => null) : undefined;
    return { base, path, status: response.status, body };
  } catch (error) {
    return {
      base,
      path,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function conclude(
  results: ProbeResult[],
  workingBase: string | null,
  /** La base que está configurada ahora mismo, no la constante del módulo:
   *  son distintas cuando se diagnostica una base concreta. */
  configuredBase: string,
): string {
  if (workingBase) {
    const yaConfigurada = workingBase === configuredBase;
    const leagues = results.find((r) => r.path.includes("/leagues"));

    if (leagues?.status === 200) {
      return (
        `Todo correcto con la base ${workingBase}. ` +
        (yaConfigurada
          ? "Es la que ya está configurada."
          : `Ponla en FANTASY_API_BASE y vuelve a desplegar.`)
      );
    }
    return (
      `La base ${workingBase} y el token son correctos, pero ` +
      `/v1/competition/${COMPETITION_ID}/leagues responde ` +
      `${leagues?.status ?? "nada"}. El problema es el identificador de ` +
      `competición: prueba otro valor en FANTASY_COMPETITION_ID. ` +
      (yaConfigurada ? "" : `Y de paso pon FANTASY_API_BASE=${workingBase}.`)
    );
  }

  if (results.some((r) => r.status === 401 || r.status === 403)) {
    return (
      "El token no vale: la API contesta pero rechaza la autorización. " +
      "Vuelve a iniciar sesión en /setup/login."
    );
  }

  if (results.every((r) => r.status === 404)) {
    return (
      "Ninguna base responde a /v4/user/me. La API ha cambiado de sitio o de " +
      "forma; no es un problema de configuración que se arregle desde aquí."
    );
  }

  return "Resultado no concluyente. Mira los códigos de estado de abajo.";
}

export async function diagnoseApi(options: {
  session?: FantasySession;
  fetchImpl?: typeof fetch;
  base?: string;
} = {}): Promise<ApiDiagnosis> {
  const session = options.session ?? new FantasySession(DEFAULT_ACCOUNT_ID);
  const fetchImpl = options.fetchImpl ?? fetch;
  const configuredBase = (options.base ?? API_BASE).replace(/\/$/, "");
  const token = await session.getBearerToken();

  const results: ProbeResult[] = [];
  let workingBase: string | null = null;
  let me: unknown = null;

  // En serie, como todo lo que habla con esta API.
  for (const base of candidateBases(configuredBase)) {
    const result = await probe(base, endpoints.me(), token, fetchImpl);
    results.push(result);
    if (result.status === 200 && workingBase === null) {
      workingBase = base;
      me = result.body;
    }
  }

  // Con una base que funciona, la siguiente duda es el id de competición.
  if (workingBase) {
    results.push(
      await probe(workingBase, endpoints.leagues(), token, fetchImpl),
    );
  }

  return {
    results,
    workingBase,
    me,
    conclusion: conclude(results, workingBase, configuredBase),
  };
}
