CREATE TABLE IF NOT EXISTS "sent_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sent_alerts_sent_idx" ON "sent_alerts" USING btree ("sent_at");