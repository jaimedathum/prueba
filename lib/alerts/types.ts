/**
 * Alertas.
 *
 * El criterio de diseño es uno solo: **si no hay nada accionable, no se
 * manda nada**. Una app que avisa todos los días se deja de leer, y entonces
 * el aviso que de verdad importaba pasa desapercibido. Cada alerta tiene que
 * justificar la interrupción.
 */

export type AlertPriority = "high" | "medium" | "low";

export type AlertKind =
  | "clause-risk"
  | "clause-opportunity"
  | "transfer"
  | "bid"
  | "speculation"
  | "sync-failure";

export interface Alert {
  /**
   * Clave estable: el mismo problema genera la misma clave en ejecuciones
   * distintas, y por eso se puede evitar repetirlo.
   */
  key: string;
  kind: AlertKind;
  priority: AlertPriority;
  title: string;
  body: string;
}

/**
 * Cuánto tiene que pasar antes de volver a avisar de lo mismo.
 *
 * Un riesgo de cláusula sigue ahí mañana y no hace falta recordarlo cada día;
 * una puja caduca con el mercado y conviene repetirla si sigue viva. Que una
 * sincronización falle sí merece insistencia diaria: sin datos no hay nada.
 */
export const COOLDOWN_HOURS: Record<AlertKind, number> = {
  "clause-risk": 48,
  "clause-opportunity": 48,
  transfer: 72,
  bid: 20,
  speculation: 48,
  "sync-failure": 12,
};

/** Solo se interrumpe por prioridad alta o media. */
export const MIN_PRIORITY_TO_SEND: AlertPriority = "medium";

const PRIORITY_ORDER: Record<AlertPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function meetsThreshold(
  priority: AlertPriority,
  threshold: AlertPriority = MIN_PRIORITY_TO_SEND,
): boolean {
  return PRIORITY_ORDER[priority] >= PRIORITY_ORDER[threshold];
}

export function sortByPriority(alerts: Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority],
  );
}

/** Formato del mensaje. Corto, ordenado por urgencia y directo a la acción. */
export function formatDigest(alerts: Alert[]): string {
  const sorted = sortByPriority(alerts);
  const icons: Record<AlertPriority, string> = {
    high: "🔴",
    medium: "🟡",
    low: "⚪",
  };

  const lines = sorted.map(
    (alert) => `${icons[alert.priority]} *${alert.title}*\n${alert.body}`,
  );

  return lines.join("\n\n");
}
