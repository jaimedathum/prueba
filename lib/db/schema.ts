import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * CAPA 1 — CRUDA (append-only)
 *
 * Respuestas tal cual, sin interpretar. Nunca se borra ni se actualiza.
 * Sirve para dos cosas: reprocesar el pasado cuando mejore un modelo, y
 * diagnosticar qué cambió cuando la API no oficial se rompa.
 * ------------------------------------------------------------------ */

export const rawResponses = pgTable(
  "raw_responses",
  {
    id: serial("id").primaryKey(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 'fantasy-api' | 'jornadaperfecta' | 'futbolfantasy' | ... */
    source: text("source").notNull(),
    /** Ruta ya resuelta, sin el host. */
    endpoint: text("endpoint").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>(),
    status: integer("status").notNull(),
    body: jsonb("body").notNull(),
    /** SHA-256 del cuerpo: permite saltarse el guardado si nada ha cambiado. */
    contentHash: text("content_hash").notNull(),
  },
  (t) => [
    index("raw_responses_source_endpoint_idx").on(
      t.source,
      t.endpoint,
      t.fetchedAt,
    ),
    index("raw_responses_hash_idx").on(t.contentHash),
  ],
);

/* ------------------------------------------------------------------ *
 * CAPA 2 — DERIVADA
 *
 * Normalizada y reconstruible al 100% desde la capa cruda. Si algo aquí
 * está mal, se arregla el parser y se reprocesa; nunca se parchea a mano
 * (para eso está la capa 3).
 * ------------------------------------------------------------------ */

/** Equipos reales de LaLiga (no los de la liga fantasy). */
export const realTeams = pgTable("real_teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  badgeUrl: text("badge_url"),
});

export const players = pgTable(
  "players",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nickname: text("nickname"),
    /** 1=portero, 2=defensa, 3=medio, 4=delantero (a confirmar en fase 0). */
    positionId: smallint("position_id").notNull(),
    realTeamId: text("real_team_id").references(() => realTeams.id),
    /** 'ok' | 'injured' | 'doubtful' | 'suspended' | 'unknown' */
    status: text("status").notNull().default("unknown"),
    marketValue: bigint("market_value", { mode: "number" }),
    totalPoints: integer("total_points"),
    averagePoints: integer("average_points"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("players_team_idx").on(t.realTeamId),
    index("players_position_idx").on(t.positionId),
  ],
);

/** Participantes de la liga privada: tú y tus amigos. */
export const managers = pgTable(
  "managers",
  {
    /** teamId dentro de la liga. */
    id: text("id").primaryKey(),
    leagueId: text("league_id").notNull(),
    teamName: text("team_name").notNull(),
    managerName: text("manager_name"),
    isMe: boolean("is_me").notNull().default(false),
    /** Saldo, solo cuando la API lo expone (para el tuyo siempre; para el resto casi nunca). */
    reportedBalance: bigint("reported_balance", { mode: "number" }),
    teamValue: bigint("team_value", { mode: "number" }),
    points: integer("points"),
    position: integer("position"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("managers_league_idx").on(t.leagueId)],
);

/** Quién posee a quién, ahora mismo. Un jugador tiene como mucho un dueño. */
export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: serial("id").primaryKey(),
    leagueId: text("league_id").notNull(),
    managerId: text("manager_id")
      .notNull()
      .references(() => managers.id),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    buyoutClause: bigint("buyout_clause", { mode: "number" }),
    /** Algunas ligas bloquean la cláusula unas horas tras el fichaje. */
    clauseLockedUntil: timestamp("clause_locked_until", { withTimezone: true }),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }),
    acquisitionPrice: bigint("acquisition_price", { mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("roster_entries_league_player_idx").on(t.leagueId, t.playerId),
    index("roster_entries_manager_idx").on(t.managerId),
  ],
);

export const marketListings = pgTable(
  "market_listings",
  {
    /** marketId del juego. */
    id: text("id").primaryKey(),
    leagueId: text("league_id").notNull(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    /** null = jugador libre puesto por el sistema; si no, lo vende un manager. */
    sellerManagerId: text("seller_manager_id").references(() => managers.id),
    /** Valor de mercado en el momento de verlo: es el SUELO de la puja. */
    marketValue: bigint("market_value", { mode: "number" }).notNull(),
    /** Precio pedido cuando lo lista un manager, si difiere del valor. */
    askingPrice: bigint("asking_price", { mode: "number" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("market_listings_league_idx").on(t.leagueId, t.lastSeenAt),
    index("market_listings_player_idx").on(t.playerId),
  ],
);

/**
 * Feed de actividad de la liga. Es la tabla más importante del proyecto:
 * de aquí salen la caja de cada rival y su patrón de pujas, que es lo único
 * que ninguna web pública puede darte.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    /** id del evento en el feed; si el feed no lo trae, hash determinista del contenido. */
    id: text("id").primaryKey(),
    leagueId: text("league_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Ver ACTIVITY_EVENT_TYPES en lib/domain/activity.ts */
    type: text("type").notNull(),
    /** Quién protagoniza el evento (el que compra, el que cobra la cláusula...). */
    managerId: text("manager_id").references(() => managers.id),
    /** La otra parte, cuando es un movimiento entre managers. */
    counterpartyManagerId: text("counterparty_manager_id").references(
      () => managers.id,
    ),
    playerId: text("player_id").references(() => players.id),
    amount: bigint("amount", { mode: "number" }),
    /**
     * Falso cuando el feed no expone el importe y hay que estimarlo.
     * Es lo que convierte la caja de un número en una banda: sin este flag
     * la app fingiría una precisión que no tiene.
     */
    amountCertain: boolean("amount_certain").notNull().default(true),
    /** Valor de mercado del jugador ese día: necesario para el multiplicador de puja. */
    marketValueAtTime: bigint("market_value_at_time", { mode: "number" }),
    raw: jsonb("raw").notNull(),
  },
  (t) => [
    index("activity_events_league_time_idx").on(t.leagueId, t.occurredAt),
    index("activity_events_manager_idx").on(t.managerId),
    index("activity_events_type_idx").on(t.type),
  ],
);

/* ------------------------------------------------------------------ *
 * CAPA 3 — OVERRIDES MANUALES
 *
 * La mitad "manual" de la ingesta híbrida. Se aplican ENCIMA de la capa
 * derivada al leer, así que una resincronización jamás pisa una corrección
 * hecha a mano.
 * ------------------------------------------------------------------ */

export const manualOverrides = pgTable(
  "manual_overrides",
  {
    id: serial("id").primaryKey(),
    /** 'player' | 'manager' | 'roster_entry' | 'activity_event' | 'market_listing' */
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    value: jsonb("value").notNull(),
    reason: text("reason"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("manual_overrides_lookup_idx").on(t.entity, t.entityId, t.active),
  ],
);

/* ------------------------------------------------------------------ *
 * SNAPSHOTS DIARIOS (append-only)
 *
 * El activo más valioso del proyecto y el único NO recuperable hacia atrás.
 * Por eso el cron se despliega antes que la interfaz.
 * ------------------------------------------------------------------ */

export const playerValueSnapshots = pgTable(
  "player_value_snapshots",
  {
    capturedOn: date("captured_on").notNull(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    marketValue: bigint("market_value", { mode: "number" }).notNull(),
    totalPoints: integer("total_points"),
    status: text("status"),
    /** Cuántos managers lo tienen: predictor de recorrido de precio. */
    ownedCount: integer("owned_count"),
    /** Si estaba en el mercado ese día (las pujas mueven el precio). */
    onMarket: boolean("on_market"),
  },
  (t) => [primaryKey({ columns: [t.capturedOn, t.playerId] })],
);

export const rosterSnapshots = pgTable(
  "roster_snapshots",
  {
    capturedOn: date("captured_on").notNull(),
    leagueId: text("league_id").notNull(),
    managerId: text("manager_id").notNull(),
    playerId: text("player_id").notNull(),
    buyoutClause: bigint("buyout_clause", { mode: "number" }),
    marketValue: bigint("market_value", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.capturedOn, t.leagueId, t.playerId] })],
);

export const managerSnapshots = pgTable(
  "manager_snapshots",
  {
    capturedOn: date("captured_on").notNull(),
    leagueId: text("league_id").notNull(),
    managerId: text("manager_id").notNull(),
    reportedBalance: bigint("reported_balance", { mode: "number" }),
    teamValue: bigint("team_value", { mode: "number" }),
    points: integer("points"),
    position: integer("position"),
  },
  (t) => [primaryKey({ columns: [t.capturedOn, t.leagueId, t.managerId] })],
);

/* ------------------------------------------------------------------ *
 * FUENTES SECUNDARIAS Y SU ACIERTO
 *
 * Cada fuente de onces probables vota, y el peso de su voto sale de su
 * acierto medido aquí. Nada de fiarse del acierto que declara cada web.
 * ------------------------------------------------------------------ */

export const lineupPredictions = pgTable(
  "lineup_predictions",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    matchday: integer("matchday").notNull(),
    playerId: text("player_id").notNull(),
    predictedStarter: boolean("predicted_starter").notNull(),
    /** Confianza declarada por la fuente, si la da. */
    confidence: integer("confidence"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Se rellena cuando el partido se juega: es lo que permite medir el acierto. */
    actualStarter: boolean("actual_starter"),
  },
  (t) => [
    uniqueIndex("lineup_predictions_unique_idx").on(
      t.source,
      t.matchday,
      t.playerId,
    ),
    index("lineup_predictions_matchday_idx").on(t.matchday),
  ],
);

export const injuryReports = pgTable(
  "injury_reports",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    playerId: text("player_id").notNull(),
    /** 'injured' | 'doubtful' | 'suspended' | 'ok' */
    status: text("status").notNull(),
    detail: text("detail"),
    expectedReturn: date("expected_return"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("injury_reports_player_idx").on(t.playerId, t.capturedAt)],
);

/* ------------------------------------------------------------------ *
 * OPERACIÓN
 * ------------------------------------------------------------------ */

/** Token de sesión de la API, cifrado en reposo (AES-256-GCM). */
export const authTokens = pgTable("auth_tokens", {
  /** Singleton: siempre 'default'. La app es de un solo usuario. */
  id: text("id").primaryKey(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** 'running' | 'ok' | 'failed' | 'dry-run' */
    status: text("status").notNull(),
    stats: jsonb("stats").$type<Record<string, number>>(),
    error: text("error"),
  },
  (t) => [index("sync_runs_started_idx").on(t.startedAt)],
);

/**
 * Diario de decisiones: cada recomendación y lo que pasó después.
 * Es lo que permite mostrar acierto medido en vez de promesas.
 */
export const decisionLog = pgTable(
  "decision_log",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 'lineup' | 'bid' | 'shield' | 'clause_attack' | 'transfer' | 'speculation' */
    kind: text("kind").notNull(),
    subjectId: text("subject_id"),
    recommendation: jsonb("recommendation").notNull(),
    /** Qué hizo el usuario de verdad, si lo registra. */
    userAction: text("user_action"),
    /** Se rellena a posteriori para medir el acierto. */
    outcome: jsonb("outcome"),
  },
  (t) => [index("decision_log_kind_idx").on(t.kind, t.createdAt)],
);
