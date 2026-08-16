/*
 * Multi-tenancy: cuentas, ligas por cuenta, y scope de propiedad.
 *
 * ESCRITA A MANO sobre la que generó drizzle-kit. La generada describe bien el
 * estado final pero no se puede aplicar sobre una base con datos dentro:
 * añadía columnas NOT NULL a tablas con filas, creaba una segunda clave
 * primaria en `sent_alerts` sin retirar la vieja, y borraba `managers.is_me`
 * antes de que nadie lo hubiera leído — que es justo el dato del que sale la
 * identidad de la cuenta existente.
 *
 * El orden de aquí sí importa: crear → sembrar → backfill → restringir →
 * borrar lo viejo. El estado final es idéntico al del snapshot.
 */

CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_leagues" (
	"account_id" text NOT NULL,
	"league_id" text NOT NULL,
	"my_team_id" text,
	"competition_id" text DEFAULT '1' NOT NULL,
	"initial_budget" bigint,
	"clause_multiplier" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_leagues_account_id_league_id_pk" PRIMARY KEY("account_id","league_id")
);
--> statement-breakpoint

/* La cuenta del despliegue que ya existe. En la fase 1b el registro creará
   cuentas de verdad; esta mantiene funcionando lo que ya está montado. */
INSERT INTO "accounts" ("id") VALUES ('default') ON CONFLICT DO NOTHING;
--> statement-breakpoint

/* auth_tokens: renombrar, NO recrear. La columna `id` ya contiene 'default',
   así que el renombrado conserva el refresh token cifrado. Crear una columna
   nueva lo habría dejado huérfano y habría obligado a rehacer el login. */
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM information_schema.columns
   WHERE table_name = 'auth_tokens' AND column_name = 'id'
 ) THEN
   ALTER TABLE "auth_tokens" RENAME COLUMN "id" TO "account_id";
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN IF NOT EXISTS "key_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE "auth_tokens" SET "account_id" = 'default' WHERE "account_id" <> 'default';
--> statement-breakpoint

/* La identidad sale de `is_me`, que es lo único que la tenía. */
INSERT INTO "account_leagues" ("account_id", "league_id", "my_team_id")
SELECT 'default', m."league_id", m."id"
FROM "managers" m
WHERE m."is_me" = true
ON CONFLICT DO NOTHING;
--> statement-breakpoint

/* Y si nunca se llegó a identificar el equipo, al menos queda anotada la liga:
   así la app pide completar la configuración en vez de aparecer vacía y muda. */
INSERT INTO "account_leagues" ("account_id", "league_id", "my_team_id")
SELECT 'default', m."league_id", NULL
FROM "managers" m
WHERE NOT EXISTS (SELECT 1 FROM "account_leagues")
GROUP BY m."league_id"
ORDER BY count(*) DESC
LIMIT 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint

/* Columnas de cuenta: nullable primero, backfill, y solo entonces NOT NULL.
   Al revés falla en cuanto haya una sola fila. */
ALTER TABLE "manual_overrides" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
UPDATE "manual_overrides" SET "account_id" = 'default' WHERE "account_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "manual_overrides" ALTER COLUMN "account_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "decision_log" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
UPDATE "decision_log" SET "account_id" = 'default' WHERE "account_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "decision_log" ALTER COLUMN "account_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sent_alerts" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
UPDATE "sent_alerts" SET "account_id" = 'default' WHERE "account_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "sent_alerts" ALTER COLUMN "account_id" SET NOT NULL;
--> statement-breakpoint

/* La clave primaria de `sent_alerts` pasa a (cuenta, clave). Con `key` sola,
   el primer cliente en recibir un aviso silenciaba a todos los demás: la clave
   de un riesgo de cláusula es la misma para cualquiera que tenga a ese
   jugador. Hay que retirar la vieja antes de poner la nueva. */
ALTER TABLE "sent_alerts" DROP CONSTRAINT IF EXISTS "sent_alerts_pkey";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sent_alerts" ADD CONSTRAINT "sent_alerts_account_id_key_pk" PRIMARY KEY("account_id","key");
EXCEPTION
 WHEN duplicate_table THEN null;
 WHEN invalid_table_definition THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "sync_runs" ADD COLUMN IF NOT EXISTS "league_id" text;
--> statement-breakpoint
UPDATE "sync_runs" SET "league_id" = (
  SELECT "league_id" FROM "account_leagues" ORDER BY "created_at" LIMIT 1
) WHERE "league_id" IS NULL;
--> statement-breakpoint

/* Claves ajenas, ya con la cuenta sembrada y las filas backfilleadas. */
DO $$ BEGIN
 ALTER TABLE "account_leagues" ADD CONSTRAINT "account_leagues_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sent_alerts" ADD CONSTRAINT "sent_alerts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "account_leagues_league_idx" ON "account_leagues" USING btree ("league_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_leagues_active_idx" ON "account_leagues" USING btree ("active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_league_idx" ON "sync_runs" USING btree ("league_id","started_at");
--> statement-breakpoint
DROP INDEX IF EXISTS "decision_log_kind_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_log_kind_idx" ON "decision_log" USING btree ("account_id","kind","created_at");
--> statement-breakpoint
DROP INDEX IF EXISTS "manual_overrides_lookup_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_overrides_lookup_idx" ON "manual_overrides" USING btree ("account_id","entity","entity_id","active");
--> statement-breakpoint

/* Lo último: ya se ha leído todo lo que hacía falta de él. */
ALTER TABLE "managers" DROP COLUMN IF EXISTS "is_me";
