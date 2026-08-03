/**
 * Catálogo de endpoints de la API de LaLiga Fantasy Oficial.
 *
 * REGLA INNEGOCIABLE: aquí solo entran rutas de LECTURA. La app recomienda,
 * el usuario ejecuta en la app oficial. Los endpoints de escritura que existen
 * (`/market/{id}/bid`, `/buyout/player`, `/buyout/{id}/pay`, `PUT /lineup`)
 * están deliberadamente ausentes, y el cliente rechaza cualquier ruta que no
 * esté en esta lista. La garantía es estructural, no de disciplina.
 */

/**
 * Base de la API del juego.
 *
 * Sin confirmar: hay un proyecto de terceros que apunta a
 * `https://fantasy-api.llt-services.com/api` (con prefijo `/api`) mientras que
 * aquí se usa la raíz. Es configurable justo por eso: si la sincronización
 * devuelve 404 en TODAS las rutas —no en una suelta— es este prefijo, y se
 * arregla con una variable de entorno en vez de tocar código.
 */
export const API_BASE = (
  process.env.FANTASY_API_BASE || "https://fantasy-api.llt-services.com"
).replace(/\/$/, "");

/**
 * Identificador de competición. Se confirma en la fase 0 leyendo la respuesta
 * de `/v4/user/me` o de `leagues`; se deja configurable para no hardcodear una
 * suposición.
 */
export const COMPETITION_ID = process.env.FANTASY_COMPETITION_ID ?? "1";

const CMP = `/v1/competition/${COMPETITION_ID}`;

/**
 * Plantillas de ruta. `:param` marca un hueco. De aquí salen tanto el
 * constructor de la ruta como la expresión regular de la allowlist, así que
 * es imposible que ambos se desincronicen.
 */
export const ENDPOINT_TEMPLATES = {
  me: "/v4/user/me",
  leagues: `${CMP}/leagues`,
  standing: `${CMP}/leagues/:leagueId/standing`,
  standingWeek: `${CMP}/leagues/:leagueId/standing/:week`,
  activity: `${CMP}/leagues/:leagueId/activity/:index`,
  team: `${CMP}/leagues/:leagueId/teams/:teamId`,
  lineup: `${CMP}/teams/:teamId/lineup`,
  lineupWeek: `${CMP}/teams/:teamId/lineup/week/:week`,
  formations: "/v4/teams/lineup/formations",
  players: `${CMP}/players`,
  player: `${CMP}/player/:playerId/league/:leagueId`,
  market: `${CMP}/league/:leagueId/market`,
  currentWeek: `${CMP}/week/current`,
  calendar: `${CMP}/calendar`,
  weekStats: `/stats/v1/competition/${COMPETITION_ID}/stats/week/:week`,
} as const;

export type EndpointName = keyof typeof ENDPOINT_TEMPLATES;

/** Segmento de ruta seguro: sin barras, sin `..`, sin query inyectada. */
function encodeSegment(value: string | number): string {
  const raw = String(value);
  if (raw.length === 0) {
    throw new Error("Un parámetro de ruta no puede estar vacío");
  }
  return encodeURIComponent(raw);
}

/** Sustituye los `:param` de una plantilla por valores ya codificados. */
export function buildPath(
  template: string,
  params: Record<string, string | number> = {},
): string {
  const path = template.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Falta el parámetro de ruta "${key}" para ${template}`);
    }
    return encodeSegment(value);
  });

  const leftover = path.match(/:([A-Za-z0-9_]+)/);
  if (leftover) {
    throw new Error(`Parámetro sin resolver en ${template}: ${leftover[0]}`);
  }
  return path;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex que acepta exactamente las rutas que puede generar una plantilla. */
function templateToRegex(template: string): RegExp {
  const pattern = template
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "[^/]+" : escapeRegex(segment),
    )
    .join("/");
  return new RegExp(`^${pattern}$`);
}

const ALLOWED_PATTERNS: ReadonlyArray<RegExp> = Object.values(
  ENDPOINT_TEMPLATES,
).map(templateToRegex);

/**
 * Única puerta de entrada de la allowlist. Se comprueba sobre la ruta ya
 * resuelta, no sobre la plantilla, para que ni un parámetro con barras ni una
 * ruta construida a mano puedan colarse.
 */
export function isAllowedPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.includes("..")) return false;
  // La query se valida aparte; la allowlist mira solo la ruta.
  const [pathname] = path.split("?");
  if (!pathname) return false;
  return ALLOWED_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** Constructores tipados: la forma normal de pedir una ruta. */
export const endpoints = {
  me: () => ENDPOINT_TEMPLATES.me,
  leagues: () => ENDPOINT_TEMPLATES.leagues,
  standing: (leagueId: string) =>
    buildPath(ENDPOINT_TEMPLATES.standing, { leagueId }),
  standingWeek: (leagueId: string, week: number) =>
    buildPath(ENDPOINT_TEMPLATES.standingWeek, { leagueId, week }),
  activity: (leagueId: string, index: number) =>
    buildPath(ENDPOINT_TEMPLATES.activity, { leagueId, index }),
  team: (leagueId: string, teamId: string) =>
    buildPath(ENDPOINT_TEMPLATES.team, { leagueId, teamId }),
  lineup: (teamId: string) => buildPath(ENDPOINT_TEMPLATES.lineup, { teamId }),
  lineupWeek: (teamId: string, week: number) =>
    buildPath(ENDPOINT_TEMPLATES.lineupWeek, { teamId, week }),
  formations: () => ENDPOINT_TEMPLATES.formations,
  players: () => ENDPOINT_TEMPLATES.players,
  player: (playerId: string, leagueId: string) =>
    buildPath(ENDPOINT_TEMPLATES.player, { playerId, leagueId }),
  market: (leagueId: string) =>
    buildPath(ENDPOINT_TEMPLATES.market, { leagueId }),
  currentWeek: () => ENDPOINT_TEMPLATES.currentWeek,
  calendar: () => ENDPOINT_TEMPLATES.calendar,
  weekStats: (week: number) =>
    buildPath(ENDPOINT_TEMPLATES.weekStats, { week }),
} as const;

/**
 * Rutas de escritura conocidas. No se usan: están aquí documentadas para que
 * quede constancia de que la omisión es deliberada, y para que el test de la
 * allowlist pueda comprobar que efectivamente las rechaza.
 */
export const KNOWN_WRITE_PATHS: ReadonlyArray<string> = [
  `${CMP}/league/123/market/456/bid`,
  `${CMP}/league/123/market/456/offer/789/accept`,
  `${CMP}/league/123/market/direct-offer`,
  `${CMP}/league/123/buyout/player`,
  `${CMP}/league/123/buyout/456/pay`,
];
