import { cache } from "react";
import { getRivalsDashboard, type RivalView } from "@/lib/engine/rivals-load";

/**
 * Acceso compartido a la liga para el índice y para cada ficha.
 *
 * La caja de un rival no se puede calcular sola: se reconstruye calibrando
 * el modelo contra el único saldo visible —el tuyo— y ensanchando las
 * bandas de todos con el residuo. Sacar a un manager de ahí y calcularlo
 * aparte daría una banda distinta, y peor.
 *
 * Así que la ficha carga la liga entera y se queda con su rival. `cache`
 * evita que eso se pague dos veces en la misma petición, que es lo que
 * pasaría con la página y sus metadatos.
 */
export const getLeague = cache(getRivalsDashboard);

export interface RivalContext {
  rival: RivalView;
  /** Su posición en el orden por caja estimada, para situarlo. */
  index: number;
  total: number;
  /** Vecinos en ese mismo orden, para saltar de ficha en ficha. */
  previous: RivalView | null;
  next: RivalView | null;
}

/**
 * Un rival con lo que hace falta para navegar entre fichas sin volver al
 * índice: alguien que está comparando dos rivales no quiere ir y venir.
 */
export async function getRivalContext(
  managerId: string,
): Promise<RivalContext | null> {
  const league = await getLeague();
  if (!league) return null;

  const index = league.rivals.findIndex(
    (rival) => rival.managerId === managerId,
  );
  if (index === -1) return null;

  return {
    rival: league.rivals[index]!,
    index,
    total: league.rivals.length,
    previous: league.rivals[index - 1] ?? null,
    next: league.rivals[index + 1] ?? null,
  };
}
