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

const ICONS: Record<AlertPriority, string> = {
  high: "🔴",
  medium: "🟡",
  low: "⚪",
};

/**
 * Formato del mensaje. Corto, ordenado por urgencia y directo a la acción.
 *
 * **Texto plano.** Antes metía `*negritas*` aquí, y eso convertía esta función
 * en una fuente de mensajes rotos: los títulos y los cuerpos llevan nombres de
 * jugador y textos de error de la API, y un `_` suelto hacía que Telegram
 * devolviera 400 y se perdiera **toda la tanda**, incluido el aviso de que la
 * sincronización había fallado. El marcado ahora se aplica —y se escapa— en
 * `formatDigestMarkdown`, justo antes de enviar.
 *
 * De paso, esta versión es la que se devuelve en `?dry-run=1`, donde el
 * marcado solo estorbaba para leerlo.
 */
export function formatDigest(alerts: Alert[]): string {
  return sortByPriority(alerts)
    .map((alert) => `${ICONS[alert.priority]} ${alert.title}\n${alert.body}`)
    .join("\n\n");
}

/**
 * La misma composición, con el título en negrita y todo lo demás escapado
 * para MarkdownV2.
 *
 * Se usa MarkdownV2 y no el `Markdown` legacy porque el legacy **no define un
 * escapado fiable**: es imposible pasar por él un texto arbitrario con la
 * garantía de que no lo interprete.
 */
export function formatDigestMarkdown(
  alerts: Alert[],
  escape: (text: string) => string,
): string {
  return sortByPriority(alerts)
    .map(
      (alert) =>
        `${ICONS[alert.priority]} *${escape(alert.title)}*\n${escape(alert.body)}`,
    )
    .join("\n\n");
}
