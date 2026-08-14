/**
 * Qué significa que un jugador "está en el mercado".
 *
 * Parece obvio y no lo es, porque `market_listings` guarda historia: una fila
 * sigue ahí después de que el jugador se venda. Sin esta distinción el panel
 * mezclaba lo que se puede comprar hoy con todo lo que se pudo comprar alguna
 * vez, y el daño no se quedaba en la lista — el mercado alimenta el precio
 * sombra del dinero, que entra en la puja óptima y en la especulación de todos
 * los candidatos.
 *
 * Son dos cosas distintas y por eso se comprueban las dos:
 *
 * - `removedAt` es un **hecho ya observado**: la sincronización vio que la
 *   oferta había desaparecido del mercado.
 * - `expiresAt` es una **fecha futura conocida**: la oferta sigue registrada,
 *   pero su plazo ya ha pasado. Entre la sincronización de las 05:00 y la
 *   siguiente hay ofertas que caducan solas, y pujar por ellas no se puede.
 */

export interface ListingWindow {
  /** Cuándo se vio que ya no estaba. `null` = seguía en venta. */
  removedAt: Date | null;
  /** Cuándo caduca la oferta, si el juego lo dice. */
  expiresAt: Date | null;
}

export function isListingOpen(listing: ListingWindow, now: Date): boolean {
  if (listing.removedAt !== null) return false;

  // Sin fecha de caducidad no se inventa una: se da por viva. Es el caso de
  // los jugadores libres que pone el sistema.
  if (listing.expiresAt === null) return true;

  return listing.expiresAt.getTime() > now.getTime();
}

/**
 * Separa lo comprable de lo que ya no, conservando ambos lados.
 *
 * Devuelve también los descartados porque la interfaz necesita poder explicar
 * por qué el mercado se ha quedado corto: "no hay nada" y "lo que había ha
 * caducado desde la última sincronización" son mensajes muy distintos.
 */
export function partitionOpenListings<T extends ListingWindow>(
  listings: T[],
  now: Date,
): { open: T[]; closed: T[] } {
  const open: T[] = [];
  const closed: T[] = [];

  for (const listing of listings) {
    (isListingOpen(listing, now) ? open : closed).push(listing);
  }

  return { open, closed };
}
