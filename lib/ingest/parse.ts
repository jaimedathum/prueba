import { createHash } from "node:crypto";
import type { ActivityEventType } from "@/lib/domain/activity";
import { FieldMapper, isJsonObject, type Json } from "./mapper";

/**
 * Traducción de las respuestas crudas a las entidades derivadas.
 *
 * Todos los parsers son tolerantes a propósito: prueban varios alias por campo
 * y devuelven `null` en lo que no encuentran, dejando rastro en el informe de
 * forma (`npm run sync -- --shape`). Ninguno inventa un valor por defecto que
 * luego se confundiría con un dato real.
 */

export interface ParsedPlayer {
  id: string;
  name: string;
  nickname: string | null;
  positionId: number;
  realTeamId: string | null;
  status: string;
  marketValue: number | null;
  totalPoints: number | null;
  averagePoints: number | null;
}

const STATUS_ALIASES: Record<string, string> = {
  ok: "ok",
  available: "ok",
  activo: "ok",
  injured: "injured",
  lesionado: "injured",
  doubt: "doubtful",
  doubtful: "doubtful",
  duda: "doubtful",
  warned: "doubtful",
  sanctioned: "suspended",
  suspended: "suspended",
  sancionado: "suspended",
  out_of_league: "unknown",
};

export function normalizeStatus(raw: string | null): string {
  if (!raw) return "unknown";
  return STATUS_ALIASES[raw.toLowerCase().trim()] ?? "unknown";
}

/**
 * Alias del id de equipo dentro de un jugador.
 *
 * Los comparten `parsePlayer` y `parseRealTeam` a propósito: son las dos
 * caras del mismo dato, y cuando divergieron el resultado fue una violación
 * de clave ajena que tumbaba la sincronización entera. Mientras salgan de
 * aquí, es imposible que un jugador apunte a un equipo que no se ha guardado.
 */
const TEAM_ID_ALIASES = ["team.id", "teamId", "realTeamId"] as const;

export interface ParsedRealTeam {
  id: string;
  name: string;
  shortName: string | null;
  badgeUrl: string | null;
}

/**
 * Equipo real, extraído de la ficha de un jugador.
 *
 * Si hay id pero no nombre se usa el id como nombre. No es inventarse un
 * dato: es admitir que no se sabe, conservando el vínculo del que dependen el
 * modelo de equipos y el ajuste por rival. En cuanto una respuesta traiga el
 * nombre de verdad, el upsert lo corrige.
 */
export function parseRealTeam(raw: unknown): ParsedRealTeam | null {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "realTeam");

  const id = m.string(...TEAM_ID_ALIASES);
  if (!id) return null;

  return {
    id,
    name: m.string("team.name", "teamName", "team.shortName") ?? id,
    shortName: m.string("team.shortName", "teamShortName"),
    badgeUrl: m.string("team.badgeColor", "team.badge", "teamBadge"),
  };
}

export function parsePlayer(raw: unknown): {
  player: ParsedPlayer | null;
  mapper: FieldMapper;
} {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "player");

  const id = m.string("id", "playerId", "player.id");
  const name = m.string("name", "nickname", "playerName");
  const positionId = m.number("positionId", "position", "positionType");

  if (!id || !name || positionId === null) {
    return { player: null, mapper: m };
  }

  return {
    player: {
      id,
      name,
      nickname: m.string("nickname", "shortName"),
      positionId,
      realTeamId: m.string(...TEAM_ID_ALIASES),
      status: normalizeStatus(
        m.string("playerStatus", "status", "situation"),
      ),
      marketValue: m.number("marketValue", "value", "marketvalue"),
      totalPoints: m.number("points", "totalPoints"),
      averagePoints: m.number("averagePoints", "avgPoints", "average"),
    },
    mapper: m,
  };
}

export interface ParsedManager {
  id: string;
  leagueId: string;
  teamName: string;
  managerName: string | null;
  reportedBalance: number | null;
  teamValue: number | null;
  points: number | null;
  position: number | null;
}

export function parseManager(
  raw: unknown,
  leagueId: string,
): { manager: ParsedManager | null; mapper: FieldMapper } {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "manager");

  const id = m.string("id", "teamId", "team.id");
  // Sin id no hay entidad posible. El nombre, en cambio, es cosmético: perder
  // un manager entero por no encontrar cómo se llama su equipo dejaba la liga
  // vacía y con ella las plantillas, los snapshots y la caja. Confirmado en la
  // práctica: la clasificación real trae el id pero ninguno de los alias de
  // nombre que se probaban.
  if (!id) return { manager: null, mapper: m };

  const managerName = m.string(
    "manager.managerName",
    "managerName",
    "team.manager.managerName",
    "user.name",
  );

  const teamName =
    m.string(
      "name",
      "teamName",
      "team.name",
      "team.teamName",
      "teamNameLarge",
    ) ??
    managerName ??
    `Equipo ${id}`;

  return {
    manager: {
      id,
      leagueId,
      teamName,
      managerName,
      // Solo llega para tu propio equipo; para los rivales casi nunca.
      reportedBalance: m.number("teamMoney", "balance", "money"),
      teamValue: m.number("teamValue", "value"),
      points: m.number("points", "totalPoints"),
      position: m.number("position", "rank"),
    },
    mapper: m,
  };
}

/**
 * Saldo de un equipo, sacado del detalle del equipo.
 *
 * La clasificación **no lo trae** —confirmado en la práctica— y por eso la
 * calibración se quedaba sin nada contra lo que corregir: la caja propia salía
 * igual al presupuesto inicial supuesto (200M) en vez de al real, y ese sesgo
 * se propagaba a las bandas de todos los rivales.
 *
 * Para los rivales normalmente será null, que es correcto: su saldo no es
 * visible y justo por eso hay un motor que lo estima.
 */
export function parseTeamBalance(payload: unknown): number | null {
  const source: Json = isJsonObject(payload) ? payload : {};
  const m = new FieldMapper(source, "teamBalance");
  return m.number(
    "teamMoney",
    "money",
    "balance",
    "team.teamMoney",
    "team.money",
    "teamBalance",
  );
}

export interface ParsedRosterEntry {
  playerId: string;
  buyoutClause: number | null;
  clauseLockedUntil: Date | null;
  acquiredAt: Date | null;
  acquisitionPrice: number | null;
}

export function parseRosterEntry(raw: unknown): {
  entry: ParsedRosterEntry | null;
  mapper: FieldMapper;
} {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "rosterEntry");

  const playerId =
    m.string("playerMaster.id", "player.id", "playerId") ?? m.string("id");
  if (!playerId) return { entry: null, mapper: m };

  return {
    entry: {
      playerId,
      buyoutClause: m.number("buyoutClause", "clause", "buyout"),
      clauseLockedUntil: m.date("buyoutClauseLockedEndTime", "clauseLockedUntil"),
      acquiredAt: m.date("acquisitionDate", "boughtAt"),
      acquisitionPrice: m.number("acquisitionPrice", "boughtFor"),
    },
    mapper: m,
  };
}

export interface ParsedMarketListing {
  id: string;
  playerId: string;
  sellerManagerId: string | null;
  marketValue: number;
  askingPrice: number | null;
  expiresAt: Date | null;
}

export function parseMarketListing(raw: unknown): {
  listing: ParsedMarketListing | null;
  mapper: FieldMapper;
} {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "marketListing");

  const id = m.string("id", "marketId");
  const playerId = m.string("playerMaster.id", "player.id", "playerId");
  const marketValue = m.number(
    "playerMaster.marketValue",
    "player.marketValue",
    "marketValue",
    "salePrice",
  );

  if (!id || !playerId || marketValue === null) {
    return { listing: null, mapper: m };
  }

  return {
    listing: {
      id,
      playerId,
      // Sin vendedor = jugador libre puesto por el sistema.
      sellerManagerId: m.string("sellerTeam.id", "seller.id", "sellerId"),
      marketValue,
      askingPrice: m.number("salePrice", "askingPrice"),
      expiresAt: m.date("expirationDate", "expiresAt"),
    },
    mapper: m,
  };
}

export interface ParsedMatch {
  id: string;
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  kickoffAt: Date | null;
  finished: boolean;
}

export function parseMatch(
  raw: unknown,
  matchday: number,
): { match: ParsedMatch | null; mapper: FieldMapper } {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "match");

  // `localId` y `visitorId` son los que trae el calendario de verdad: sin
  // ellos el parser abortaba antes de leer nada más, y por eso el informe de
  // mapeo daba por "sin usar" campos que sí se piden más abajo.
  const homeTeamId = m.string(
    "localId",
    "local.id",
    "homeTeam.id",
    "localTeamId",
  );
  const awayTeamId = m.string(
    "visitorId",
    "visitor.id",
    "awayTeam.id",
    "visitorTeamId",
  );
  if (!homeTeamId || !awayTeamId) return { match: null, mapper: m };

  const homeGoals = m.number("localScore", "homeGoals", "local.score");
  const awayGoals = m.number("visitorScore", "awayGoals", "visitor.score");
  const state = m.string("matchState", "state", "status");

  return {
    match: {
      id:
        m.string("id", "matchId") ??
        deterministicId([matchday, homeTeamId, awayTeamId]),
      matchday,
      homeTeamId,
      awayTeamId,
      homeGoals,
      awayGoals,
      kickoffAt: m.date("date", "matchDate", "kickoff"),
      // Un partido cuenta para el modelo solo si tiene resultado: un 0-0 sin
      // jugar y un 0-0 real no son lo mismo.
      finished:
        homeGoals !== null &&
        awayGoals !== null &&
        (state === null || /final|finish|played|jugado/i.test(state)),
    },
    mapper: m,
  };
}

export interface ParsedPlayerMatchStat {
  playerId: string;
  minutes: number | null;
  points: number | null;
  started: boolean | null;
}

export function parsePlayerMatchStat(raw: unknown): {
  stat: ParsedPlayerMatchStat | null;
  mapper: FieldMapper;
} {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "playerMatchStat");

  const playerId = m.string("playerId", "player.id", "id");
  if (!playerId) return { stat: null, mapper: m };

  const minutes = m.number("mins_played", "minutesPlayed", "minutes");
  const started = m.boolean("isStarter", "starter", "titular");

  return {
    stat: {
      playerId,
      minutes,
      points: m.number("totalPoints", "points", "weekPoints"),
      // Sin dato explícito, se infiere de los minutos: quien juega mucho
      // casi siempre ha salido de inicio.
      started: started ?? (minutes !== null ? minutes >= 60 : null),
    },
    mapper: m,
  };
}

/* ------------------------------------------------------------------ *
 * Feed de actividad
 * ------------------------------------------------------------------ */

/**
 * Clasificación del tipo de evento. Deliberadamente conservadora: lo que no
 * se reconoce se queda en "unknown", que el motor de presupuesto trata como
 * incierto y refleja ensanchando la banda. Es preferible una banda ancha y
 * honesta a un número estrecho e inventado.
 */
const TYPE_PATTERNS: ReadonlyArray<[RegExp, ActivityEventType]> = [
  [/clausul|buyout|rescis/i, "clause_paid"],
  [/blindaj|shield|increase.?clause|subida.?clausula/i, "clause_raised"],
  [/premio|prize|reward|bonus/i, "prize"],
  [/traspaso|transfer|offer.?accept|venta.?directa/i, "manager_transfer"],
  [/compra|purchase|buy|puja.?ganad|bid.?won/i, "market_purchase"],
  [/venta|sale|sell|sold/i, "market_sale"],
];

export function classifyActivityType(raw: string | null): ActivityEventType {
  if (!raw) return "unknown";
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(raw)) return type;
  }
  return "unknown";
}

export interface ParsedActivityEvent {
  id: string;
  leagueId: string;
  occurredAt: Date;
  type: ActivityEventType;
  managerId: string | null;
  counterpartyManagerId: string | null;
  playerId: string | null;
  amount: number | null;
  amountCertain: boolean;
  raw: unknown;
}

/** Id estable cuando el feed no trae uno: mismo evento, mismo id. */
function deterministicId(parts: Array<string | number | null>): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export function parseActivityEvent(
  raw: unknown,
  leagueId: string,
): { event: ParsedActivityEvent | null; mapper: FieldMapper } {
  const source: Json = isJsonObject(raw) ? raw : {};
  const m = new FieldMapper(source, "activityEvent");

  const occurredAt = m.date("date", "operationDate", "createdAt", "timestamp");
  if (!occurredAt) return { event: null, mapper: m };

  // El feed real identifica el tipo con `activityTypeId`, un número cuyo
  // significado todavía no está confirmado: hacen falta más eventos de los que
  // tiene una liga recién creada. Se lee igualmente para que el clasificador
  // pueda reconocerlo en cuanto se sepa; mientras, cae en "unknown" y el motor
  // de caja ensancha la banda, que es el comportamiento correcto.
  const type = classifyActivityType(
    m.string("type", "operation", "operationType", "action", "activityTypeId"),
  );
  const managerId = m.string(
    "user1Id",
    "team.id",
    "teamId",
    "user.id",
    "buyerTeam.id",
  );
  const counterpartyManagerId = m.string(
    "user2Id",
    "sellerTeam.id",
    "counterpartyTeamId",
    "toTeam.id",
  );
  const playerId = m.string("playerMaster.id", "player.id", "playerId");
  const amount = m.number("amount", "price", "money", "value");

  const id =
    m.string("id", "operationId") ??
    deterministicId([
      leagueId,
      occurredAt.toISOString(),
      type,
      managerId,
      playerId,
      amount,
    ]);

  return {
    event: {
      id,
      leagueId,
      occurredAt,
      type,
      managerId,
      counterpartyManagerId,
      playerId,
      amount,
      // Un importe ausente no es un cero: es un desconocido, y así se propaga.
      amountCertain: amount !== null && type !== "unknown",
      raw,
    },
    mapper: m,
  };
}
