/**
 * Quién es quién entre el feed de actividad y la clasificación.
 *
 * El juego usa **dos espacios de identificadores** y este proyecto ya se
 * tropezó con ello una vez: `docs/reglas.md` deja escrito que el `id` de
 * `/v4/user/me` es el del **usuario**, no el del equipo, y que confundirlos
 * enseñaría la plantilla de otro como si fuera tuya.
 *
 * El mismo problema reaparece en el feed. La clasificación identifica a cada
 * manager por **equipo**, y el feed de actividad trae `user1Id`, que es de
 * **usuario**. Si no coinciden, cada movimiento se queda sin dueño, nadie
 * gasta ni ingresa, y todas las cajas se quedan clavadas en el presupuesto
 * inicial — que después la calibración desplaza a la vez, dejando a todos los
 * rivales con exactamente tu saldo.
 *
 * Por eso el índice acepta **cualquier identificador conocido** de un manager
 * y devuelve siempre el del equipo, que es la clave de `managers`. Así da
 * igual cuál de los dos use el feed.
 */

export interface IndexableManager {
  /** Id de equipo: la clave con la que se guarda. */
  id: string;
  /** Id de usuario, cuando la clasificación lo expone. */
  userId?: string | null;
}

export type ManagerIndex = Map<string, string>;

export function buildManagerIndex(managers: IndexableManager[]): ManagerIndex {
  const index: ManagerIndex = new Map();

  for (const manager of managers) {
    index.set(manager.id, manager.id);
    if (manager.userId) index.set(manager.userId, manager.id);
  }

  return index;
}

/**
 * Traduce una referencia del feed al id de equipo, o `null` si no se reconoce.
 *
 * Devolver `null` en vez de la referencia original es deliberado: una clave
 * ajena inventada tumbaría el `INSERT` entero. Lo que **no** puede pasar es
 * que además se pierda la cuenta de cuántas se han quedado por el camino, y
 * de eso se encarga `resolveManagerRefs`.
 */
export function resolveManagerRef(
  index: ManagerIndex,
  ref: string | null | undefined,
): string | null {
  if (!ref) return null;
  return index.get(ref) ?? null;
}

export interface ResolutionReport {
  /** Referencias que sí se han reconocido. */
  resolved: number;
  /** Las que no, sin repetir: sirven para saber qué espacio de ids es. */
  unknown: string[];
}

/**
 * Resuelve una tanda y **cuenta lo que falla**.
 *
 * El recuento es la mitad importante. Antes las referencias desconocidas se
 * anulaban en silencio, así que un feed entero sin atribuir producía una liga
 * donde todo el mundo tenía la misma caja, sin un solo aviso que apuntara al
 * motivo.
 */
export function resolveManagerRefs(
  index: ManagerIndex,
  refs: Array<string | null | undefined>,
): ResolutionReport {
  let resolved = 0;
  const unknown = new Set<string>();

  for (const ref of refs) {
    if (!ref) continue;
    if (resolveManagerRef(index, ref)) resolved++;
    else unknown.add(ref);
  }

  return { resolved, unknown: [...unknown] };
}
