CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"manager_id" text,
	"counterparty_manager_id" text,
	"player_id" text,
	"amount" bigint,
	"amount_certain" boolean DEFAULT true NOT NULL,
	"market_value_at_time" bigint,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text,
	"recommendation" jsonb NOT NULL,
	"user_action" text,
	"outcome" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "injury_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"player_id" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"expected_return" date,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lineup_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"matchday" integer NOT NULL,
	"player_id" text NOT NULL,
	"predicted_starter" boolean NOT NULL,
	"confidence" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actual_starter" boolean
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manager_snapshots" (
	"captured_on" date NOT NULL,
	"league_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"reported_balance" bigint,
	"team_value" bigint,
	"points" integer,
	"position" integer,
	CONSTRAINT "manager_snapshots_captured_on_league_id_manager_id_pk" PRIMARY KEY("captured_on","league_id","manager_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "managers" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_name" text NOT NULL,
	"manager_name" text,
	"is_me" boolean DEFAULT false NOT NULL,
	"reported_balance" bigint,
	"team_value" bigint,
	"points" integer,
	"position" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manual_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"player_id" text NOT NULL,
	"seller_manager_id" text,
	"market_value" bigint NOT NULL,
	"asking_price" bigint,
	"expires_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_value_snapshots" (
	"captured_on" date NOT NULL,
	"player_id" text NOT NULL,
	"market_value" bigint NOT NULL,
	"total_points" integer,
	"status" text,
	"owned_count" integer,
	"on_market" boolean,
	CONSTRAINT "player_value_snapshots_captured_on_player_id_pk" PRIMARY KEY("captured_on","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nickname" text,
	"position_id" smallint NOT NULL,
	"real_team_id" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"market_value" bigint,
	"total_points" integer,
	"average_points" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"endpoint" text NOT NULL,
	"params" jsonb,
	"status" integer NOT NULL,
	"body" jsonb NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "real_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"badge_url" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roster_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"player_id" text NOT NULL,
	"buyout_clause" bigint,
	"clause_locked_until" timestamp with time zone,
	"acquired_at" timestamp with time zone,
	"acquisition_price" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roster_snapshots" (
	"captured_on" date NOT NULL,
	"league_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"player_id" text NOT NULL,
	"buyout_clause" bigint,
	"market_value" bigint,
	CONSTRAINT "roster_snapshots_captured_on_league_id_player_id_pk" PRIMARY KEY("captured_on","league_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_counterparty_manager_id_managers_id_fk" FOREIGN KEY ("counterparty_manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_seller_manager_id_managers_id_fk" FOREIGN KEY ("seller_manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_value_snapshots" ADD CONSTRAINT "player_value_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_real_team_id_real_teams_id_fk" FOREIGN KEY ("real_team_id") REFERENCES "public"."real_teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_league_time_idx" ON "activity_events" USING btree ("league_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_manager_idx" ON "activity_events" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_type_idx" ON "activity_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_log_kind_idx" ON "decision_log" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "injury_reports_player_idx" ON "injury_reports" USING btree ("player_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lineup_predictions_unique_idx" ON "lineup_predictions" USING btree ("source","matchday","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lineup_predictions_matchday_idx" ON "lineup_predictions" USING btree ("matchday");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managers_league_idx" ON "managers" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_overrides_lookup_idx" ON "manual_overrides" USING btree ("entity","entity_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_listings_league_idx" ON "market_listings" USING btree ("league_id","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_listings_player_idx" ON "market_listings" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_team_idx" ON "players" USING btree ("real_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_position_idx" ON "players" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_responses_source_endpoint_idx" ON "raw_responses" USING btree ("source","endpoint","fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_responses_hash_idx" ON "raw_responses" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roster_entries_league_player_idx" ON "roster_entries" USING btree ("league_id","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_entries_manager_idx" ON "roster_entries" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");