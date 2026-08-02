import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rawResponses } from "@/lib/db/schema";
import type { RawRecord } from "@/lib/fantasy/client";

/**
 * Capa cruda: se guarda la respuesta tal cual, sin interpretar.
 *
 * Es lo que permite reprocesar toda la historia cuando mejore un parser y
 * diagnosticar exactamente qué cambió el día que la API no oficial se rompa.
 * Append-only: nunca se actualiza ni se borra.
 */

export function hashBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body) ?? "null").digest("hex");
}

export interface RawRecorderStats {
  stored: number;
  skippedUnchanged: number;
}

export class RawRecorder {
  readonly stats: RawRecorderStats = { stored: 0, skippedUnchanged: 0 };

  constructor(private readonly source = "fantasy-api") {}

  /**
   * Guarda la respuesta salvo que sea idéntica a la última del mismo endpoint:
   * los snapshots diarios de 1.600 jugadores repetidos no aportan nada y
   * hacen crecer la tabla sin motivo.
   */
  async record(record: RawRecord): Promise<void> {
    const db = getDb();
    const contentHash = hashBody(record.body);

    const [previous] = await db
      .select({ contentHash: rawResponses.contentHash })
      .from(rawResponses)
      .where(
        and(
          eq(rawResponses.source, this.source),
          eq(rawResponses.endpoint, record.endpoint),
        ),
      )
      .orderBy(desc(rawResponses.fetchedAt))
      .limit(1);

    if (previous?.contentHash === contentHash) {
      this.stats.skippedUnchanged++;
      return;
    }

    await db.insert(rawResponses).values({
      source: this.source,
      endpoint: record.endpoint,
      params: record.params,
      status: record.status,
      body: record.body as object,
      contentHash,
    });
    this.stats.stored++;
  }
}
