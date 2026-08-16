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
 * TENENCIA
 *
 * El eje de aislamiento no es el mismo para todo, y esa es la decisión de
 * diseño central:
 *
 * - Los **datos del juego** se scopean por `league_id`. Lo que pasa en una
 *   liga es idéntico para todos los que están dentro, así que dos suscriptores
 *   de la misma liga comparten la ingesta en vez de duplicarla.
 * - La **propiedad** se scopea por `account_id`: credenciales, correcciones
 *   manuales, avisos enviados y decisiones son de quien paga, no de la liga.
 * - Los **datos de LaLiga** (`players`, `matches`, `real_teams`…) no llevan
 *   scope ninguno: son los mismos para todo el mundo y se ingieren una vez.
 * ------------------------------------------------------------------ */

/** Un cliente. Hoy uno; mañana, los que paguen. */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  /**
   * Quién es el dueño. Nulo en la cuenta `default`, que nació antes de que
   * hubiera usuarios: la reclama el primero que inicie sesión demostrando
   * que conoce `CRON_SECRET` (ver `lib/auth.ts`). Sin eso, activar el login
   * dejaría al dueño del despliegue fuera de sus propios datos.
   */
  ownerUserId: text("owner_user_id").unique(),
  /** 'active' | 'suspended' */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ *
 * IDENTIDAD (Auth.js)
 *
 * Forma impuesta por el adaptador de Drizzle de Auth.js. Solo hay una
 * desviación: su tabla de cuentas de proveedor se llama `oauth_accounts` y no
 * `accounts`, porque ese nombre ya es de la tenencia. Son cosas distintas —
 * una es "con qué Google entra esta persona" y la otra "qué cliente es" — y
 * llamarlas igual habría sido una fuente inagotable de confusión.
 * ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("oauth_accounts_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * Qué liga mira cada cuenta y cuál es su equipo dentro de ella.
 *
 * Sustituye a dos cosas que estaban mal por motivos distintos:
 *
 * 1. `managers.is_me`, un booleano global que se escribía con un `UPDATE` sin
 *    `WHERE`. Con dos cuentas en la misma liga, cada sincronización le habría
 *    robado la identidad a la otra.
 * 2. Las variables de entorno `FANTASY_LEAGUE_ID`, `FANTASY_TEAM_ID`,
 *    `FANTASY_COMPETITION_ID`, `FANTASY_INITIAL_BUDGET` y
 *    `FANTASY_CLAUSE_MULTIPLIER`, que son propiedades de *una* liga y no del
 *    proceso que la sirve.
 */
export const accountLeagues = pgTable(
  "account_leagues",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    leagueId: text("league_id").notNull(),
    /** El equipo de esta cuenta dentro de esta liga. */
    myTeamId: text("my_team_id"),
    competitionId: text("competition_id").notNull().default("1"),
    /**
     * Nullable a propósito: `null` significa "usa el valor por defecto del
     * juego". Así una liga privada puede cambiarlos sin que el resto herede
     * su rareza, y no hay que rellenar nada al migrar.
     */
    initialBudget: bigint("initial_budget", { mode: "number" }),
    clauseMultiplier: integer("clause_multiplier"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.leagueId] }),
    index("account_leagues_league_idx").on(t.leagueId),
    index("account_leagues_active_idx").on(t.active),
  ],
);

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

/**
 * Partidos reales de LaLiga. Son la materia prima del modelo Dixon-Coles:
 * sin resultados no hay fuerza de ataque y defensa, y sin eso no hay
 * probabilidad de portería a cero, que es lo que más pesa en los puntos de
 * porteros y defensas.
 */
export const matches = pgTable(
  "matches",
  {
    id: text("id").primaryKey(),
    matchday: integer("matchday").notNull(),
    homeTeamId: text("home_team_id").notNull(),
    awayTeamId: text("away_team_id").notNull(),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    finished: boolean("finished").notNull().default(false),
  },
  (t) => [
    index("matches_matchday_idx").on(t.matchday),
    index("matches_teams_idx").on(t.homeTeamId, t.awayTeamId),
  ],
);

/**
 * Rendimiento de cada jugador en cada jornada. De aquí salen los minutos —que
 * es lo que de verdad hay que modelar— y la racha de titularidades que sirve
 * de reserva cuando ninguna fuente publica el once probable.
 */
export const playerMatchStats = pgTable(
  "player_match_stats",
  {
    playerId: text("player_id").notNull(),
    matchday: integer("matchday").notNull(),
    minutes: integer("minutes"),
    points: integer("points"),
    started: boolean("started"),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.matchday] }),
    index("player_match_stats_matchday_idx").on(t.matchday),
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
    // `is_me` vivía aquí y era el punto más incompatible con multi-tenancy de
    // todo el proyecto: un booleano global, escrito con un UPDATE sin WHERE.
    // Ahora la identidad es de la cuenta, en `account_leagues.my_team_id`.
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
    /**
     * Cuándo dejó de estar en el mercado. `null` = sigue en venta.
     *
     * Sin esto la tabla solo crecía: nada marcaba la salida de un jugador, así
     * que una fila puesta en agosto seguía contando como comprable en mayo. Y
     * no era solo cosmético — el mercado alimenta el precio sombra del dinero,
     * que a su vez entra en la puja óptima y en la especulación de **todos**
     * los candidatos.
     *
     * Se marca en vez de borrar porque cuánto tarda un jugador en venderse es
     * justo la clase de dato que no se puede reconstruir hacia atrás.
     */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    index("market_listings_league_idx").on(t.leagueId, t.lastSeenAt),
    index("market_listings_player_idx").on(t.playerId),
    /** Lo que pregunta el panel: lo que sigue en venta en esta liga. */
    index("market_listings_open_idx").on(t.leagueId, t.removedAt),
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
    /**
     * De quién es la corrección. Los ids de jugador y de manager son globales
     * de LaLiga, así que sin esto la corrección de un cliente se aplicaría a
     * todos: el espacio de claves era compartido.
     */
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
    index("manual_overrides_lookup_idx").on(
      t.accountId,
      t.entity,
      t.entityId,
      t.active,
    ),
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
  /**
   * Una credencial de LaLiga por cuenta.
   *
   * Antes era un singleton literal —`id` siempre `'default'`— y esa constante
   * era el techo duro del proyecto: no había forma de guardar un segundo
   * token en la misma base de datos.
   */
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  /**
   * Con qué versión de `TOKEN_ENCRYPTION_KEY` se cifró. Permite rotar la clave
   * sin dejar ilegibles de golpe los tokens de todos los clientes.
   */
  keyVersion: integer("key_version").notNull().default(1),
  /**
   * Política de B2C que emitió el token. Un refresh token está atado a su
   * política: refrescarlo con otra falla. Como el login por contraseña y el
   * interactivo usan políticas distintas, hay que recordar cuál fue.
   * Nullable por las filas anteriores a esta columna, que son de contraseña.
   */
  policy: text("policy"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    /**
     * Qué liga se sincronizó. Nullable porque en la fase 1c habrá también
     * ejecuciones globales —el catálogo de jugadores y el calendario, que son
     * los mismos para todo el mundo— y esas no pertenecen a ninguna liga.
     */
    leagueId: text("league_id"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** 'running' | 'ok' | 'failed' | 'dry-run' */
    status: text("status").notNull(),
    stats: jsonb("stats").$type<Record<string, number>>(),
    error: text("error"),
  },
  (t) => [
    index("sync_runs_started_idx").on(t.startedAt),
    index("sync_runs_league_idx").on(t.leagueId, t.startedAt),
  ],
);

/**
 * Alertas ya enviadas.
 *
 * Existe para que la app no se vuelva ruido. Una alerta que llega todos los
 * días se deja de leer, y entonces la que importa de verdad pasa desapercibida:
 * cada aviso se manda una vez y no se repite hasta que expira su enfriamiento.
 */
export const sentAlerts = pgTable(
  "sent_alerts",
  {
    /**
     * La clave es estable pero **no** única entre clientes: el riesgo de
     * cláusula sobre el mismo jugador genera la misma clave para dos cuentas
     * distintas. Con `key` como clave primaria a secas, el primero en recibir
     * el aviso silenciaba al segundo.
     */
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Clave estable del aviso: mismo problema, misma clave. */
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    body: text("body").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.key] }),
    index("sent_alerts_sent_idx").on(t.sentAt),
  ],
);

/**
 * Diario de decisiones: cada recomendación y lo que pasó después.
 * Es lo que permite mostrar acierto medido en vez de promesas.
 */
export const decisionLog = pgTable(
  "decision_log",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
  (t) => [index("decision_log_kind_idx").on(t.accountId, t.kind, t.createdAt)],
);
