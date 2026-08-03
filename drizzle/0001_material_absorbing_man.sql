CREATE TABLE IF NOT EXISTS "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"matchday" integer NOT NULL,
	"home_team_id" text NOT NULL,
	"away_team_id" text NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"kickoff_at" timestamp with time zone,
	"finished" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_match_stats" (
	"player_id" text NOT NULL,
	"matchday" integer NOT NULL,
	"minutes" integer,
	"points" integer,
	"started" boolean,
	CONSTRAINT "player_match_stats_player_id_matchday_pk" PRIMARY KEY("player_id","matchday")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_matchday_idx" ON "matches" USING btree ("matchday");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_teams_idx" ON "matches" USING btree ("home_team_id","away_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_match_stats_matchday_idx" ON "player_match_stats" USING btree ("matchday");