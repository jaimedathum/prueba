import { getMarketDashboard } from "@/lib/engine/market-load";
import { getRiskDashboard } from "@/lib/engine/load";
import { lastSyncRun, reconcileStaleRuns } from "@/lib/ingest/sync";
import { buildAlerts } from "./digest";
import { loadSentAlerts, recordSentAlerts, selectAlertsToSend } from "./dedupe";
import {
  escapeMarkdownV2,
  getTelegramConfig,
  sendTelegramMessage,
} from "./telegram";
import { formatDigest, formatDigestMarkdown, type Alert } from "./types";

/**
 * Ejecución del aviso diario.
 *
 * Se lanza antes del cierre de mercado. Si no hay nada que merezca
 * interrumpirte, no manda nada y lo deja dicho en el resultado: el silencio
 * también es información, y es la única forma de que cuando llegue un mensaje
 * te lo tomes en serio.
 */

export interface AlertRunResult {
  generated: number;
  sent: number;
  skipped: number;
  message: string | null;
  notified: boolean;
  reason: string;
}

export interface RunOptions {
  /** Compone el aviso pero no lo envía ni lo registra. */
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export async function runAlerts(
  options: RunOptions = {},
): Promise<AlertRunResult> {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  // Antes de mirar el estado: una sincronización cortada a mitad se queda en
  // "running", y este job solo avisa de las que están en "failed". Sin esto,
  // el fallo más grave —llevar días con datos viejos— era mudo.
  await reconcileStaleRuns(now).catch(() => 0);

  const [risk, market, sync] = await Promise.all([
    getRiskDashboard().catch(() => null),
    getMarketDashboard(now).catch(() => null),
    lastSyncRun().catch(() => null),
  ]);

  const alerts: Alert[] = buildAlerts({
    today,
    shields: risk?.shields ?? [],
    attacks: risk?.attacks ?? [],
    transfers: market?.transfers ?? null,
    candidates: market?.candidates ?? [],
    lastSyncFailed: sync?.status === "failed",
    lastSyncError: sync?.error ?? null,
  });

  const alreadySent = await loadSentAlerts(alerts.map((a) => a.key));
  const toSend = selectAlertsToSend(alerts, alreadySent, now);

  if (toSend.length === 0) {
    return {
      generated: alerts.length,
      sent: 0,
      skipped: alerts.length,
      message: null,
      notified: false,
      reason:
        alerts.length === 0
          ? "Nada accionable hoy."
          : "Todo lo accionable ya se avisó y sigue dentro de su enfriamiento.",
    };
  }

  const message = formatDigest(toSend);

  if (options.dryRun) {
    return {
      generated: alerts.length,
      sent: 0,
      skipped: alerts.length - toSend.length,
      message,
      notified: false,
      reason: "Modo de prueba: compuesto pero no enviado.",
    };
  }

  if (!getTelegramConfig()) {
    return {
      generated: alerts.length,
      sent: 0,
      skipped: alerts.length - toSend.length,
      message,
      notified: false,
      reason:
        "Hay avisos que dar pero Telegram no está configurado. Rellena " +
        "TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.",
    };
  }

  await sendTelegramMessage(formatDigestMarkdown(toSend, escapeMarkdownV2), {
    fetchImpl: options.fetchImpl,
    parseMode: "MarkdownV2",
  });
  // Solo se registra tras un envío correcto: si falla, se reintenta mañana
  // en vez de dar por avisado algo que nunca llegó.
  await recordSentAlerts(toSend);

  return {
    generated: alerts.length,
    sent: toSend.length,
    skipped: alerts.length - toSend.length,
    message,
    notified: true,
    reason: `Enviados ${toSend.length} avisos.`,
  };
}
