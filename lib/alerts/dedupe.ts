import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sentAlerts } from "@/lib/db/schema";
import { COOLDOWN_HOURS, meetsThreshold, type Alert } from "./types";

/**
 * Filtro anti-ruido.
 *
 * Dos criterios, y los dos importan: se descarta lo que no llega al umbral de
 * prioridad, y lo que ya se avisó hace poco. El segundo es el que evita que la
 * app se vuelva un fondo de pantalla que nadie lee.
 */

const HOUR_MS = 60 * 60 * 1000;

export interface SentRecord {
  key: string;
  sentAt: Date;
}

/** Parte pura: decide qué se manda, dado lo que ya se mandó. */
export function selectAlertsToSend(
  alerts: Alert[],
  alreadySent: Map<string, Date>,
  now: Date = new Date(),
): Alert[] {
  return alerts.filter((alert) => {
    if (!meetsThreshold(alert.priority)) return false;

    const previous = alreadySent.get(alert.key);
    if (!previous) return true;

    const elapsedHours = (now.getTime() - previous.getTime()) / HOUR_MS;
    return elapsedHours >= COOLDOWN_HOURS[alert.kind];
  });
}

export async function loadSentAlerts(
  keys: string[],
): Promise<Map<string, Date>> {
  if (keys.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ key: sentAlerts.key, sentAt: sentAlerts.sentAt })
    .from(sentAlerts)
    .where(inArray(sentAlerts.key, keys));
  return new Map(rows.map((row) => [row.key, row.sentAt]));
}

export async function recordSentAlerts(alerts: Alert[]): Promise<void> {
  if (alerts.length === 0) return;
  const db = getDb();
  await db
    .insert(sentAlerts)
    .values(
      alerts.map((alert) => ({
        key: alert.key,
        kind: alert.kind,
        body: `${alert.title}\n${alert.body}`,
      })),
    )
    .onConflictDoUpdate({
      target: sentAlerts.key,
      set: { sentAt: new Date() },
    });
}
