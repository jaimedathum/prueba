CREATE TABLE IF NOT EXISTS "player_league_snapshots" (
	"captured_on" date NOT NULL,
	"league_id" text NOT NULL,
	"player_id" text NOT NULL,
	"owned_count" integer,
	"on_market" boolean,
	CONSTRAINT "player_league_snapshots_captured_on_league_id_player_id_pk" PRIMARY KEY("captured_on","league_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"league_id" text,
	"account_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_league_snapshots" ADD CONSTRAINT "player_league_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_league_snapshots_league_idx" ON "player_league_snapshots" USING btree ("league_id","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_pending_idx" ON "sync_jobs" USING btree ("state","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_jobs_unique_pending_idx" ON "sync_jobs" USING btree ("kind","league_id") WHERE "sync_jobs"."state" = 'pending';--> statement-breakpoint
/* Rescate de la propiedad antes de tirar las columnas.
 *
 * `owned_count` y `on_market` eran por liga viviendo en una tabla con clave
 * global. En este punto solo hay una liga configurada, así que se le asignan
 * a ella: es exactamente de donde salieron. Si no hubiera ninguna, no hay
 * nada que rescatar y la consulta no inserta nada. */
INSERT INTO "player_league_snapshots" ("captured_on", "league_id", "player_id", "owned_count", "on_market")
SELECT s."captured_on", l."league_id", s."player_id", s."owned_count", s."on_market"
FROM "player_value_snapshots" s
CROSS JOIN (
  SELECT "league_id" FROM "account_leagues" ORDER BY "created_at" LIMIT 1
) l
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "player_value_snapshots" DROP COLUMN IF EXISTS "owned_count";--> statement-breakpoint
ALTER TABLE "player_value_snapshots" DROP COLUMN IF EXISTS "on_market";