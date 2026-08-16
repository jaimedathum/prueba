/* El feed de actividad identifica a los managers por usuario y la
 * clasificación por equipo. Sin las dos columnas no hay forma de cruzarlos,
 * y sin cruzarlos ningún movimiento cuenta para la caja de nadie. */
ALTER TABLE "managers" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managers_user_idx" ON "managers" USING btree ("user_id");