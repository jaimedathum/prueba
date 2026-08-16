/**
 * Utilidades compartidas por las dos mitades de la sincronización.
 *
 * Viven aparte porque `sync.ts` importa `sync-global.ts` y al revés habría
 * ciclo. Son las dos únicas piezas que ambas necesitan.
 */

/** Postgres tiene un tope de parámetros por sentencia; 500 filas van sobradas. */
export function chunk<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** La API devuelve a veces `{data: [...]}` y a veces el array pelado. */
export function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["data", "items", "elements", "results"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/** Fecha del snapshot, en UTC. */
export const today = () => new Date().toISOString().slice(0, 10);
