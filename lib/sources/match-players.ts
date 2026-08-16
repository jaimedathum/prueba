/**
 * De un nombre publicado por una web al jugador de la base de datos.
 *
 * Es el eslabón que faltaba para que las fuentes secundarias sirvieran de
 * algo: los scrapers devuelven nombres —"Fede Valverde", "R. Lewandowski"— y
 * los motores necesitan ids.
 *
 * La regla es la misma que ya rige la identificación del equipo propio en la
 * sincronización: **solo se resuelve lo que es único**. Ante dos candidatos no
 * se elige el primero ni el más parecido, se descarta. Equivocar a un jugador
 * aquí no falla de forma visible — mueve la probabilidad de ser titular de
 * otro, y las proyecciones salen igual de convincentes pero mal.
 */

export interface MatchablePlayer {
  id: string;
  name: string;
  nickname: string | null;
  realTeamId: string | null;
}

/**
 * Sin acentos, sin puntuación y en minúsculas.
 *
 * Las fuentes escriben "Güiza", "Guiza" y "GÜIZA" para el mismo jugador, y
 * abrevian el nombre de pila con un punto. Comparar en crudo hace fallar
 * emparejamientos que a ojo son evidentes.
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "R. Lewandowski" → "lewandowski".
 *
 * Muchas fuentes abrevian el nombre de pila. Quedarse con el apellido permite
 * emparejar eso, pero es una señal **más débil**: por eso solo se usa cuando
 * el nombre completo no ha dado con nada, y sigue exigiendo unicidad.
 */
function lastNameOf(normalized: string): string {
  const parts = normalized.split(" ").filter((part) => part.length > 1);
  return parts[parts.length - 1] ?? normalized;
}

export interface PlayerIndex {
  byFullName: Map<string, MatchablePlayer[]>;
  byLastName: Map<string, MatchablePlayer[]>;
}

export function buildPlayerIndex(players: MatchablePlayer[]): PlayerIndex {
  const byFullName = new Map<string, MatchablePlayer[]>();
  const byLastName = new Map<string, MatchablePlayer[]>();

  const push = (map: Map<string, MatchablePlayer[]>, key: string, player: MatchablePlayer) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    // El mismo jugador puede llegar por nombre y por apodo: no se duplica.
    if (!list.some((existing) => existing.id === player.id)) list.push(player);
    map.set(key, list);
  };

  for (const player of players) {
    for (const candidate of [player.name, player.nickname]) {
      if (!candidate) continue;
      const normalized = normalizeName(candidate);
      push(byFullName, normalized, player);
      push(byLastName, lastNameOf(normalized), player);
    }
  }

  return { byFullName, byLastName };
}

export type MatchOutcome =
  | { status: "matched"; playerId: string; via: "full-name" | "last-name" }
  | { status: "not-found" }
  | { status: "ambiguous"; candidates: string[] };

/**
 * `teamId` acota, no decide: cuando la fuente dice de qué equipo es y eso
 * deshace un empate, se aprovecha. Sin equipo, un empate sigue siendo empate.
 */
export function matchPlayer(
  index: PlayerIndex,
  playerName: string,
  teamId: string | null = null,
): MatchOutcome {
  const normalized = normalizeName(playerName);
  if (!normalized) return { status: "not-found" };

  for (const [map, via] of [
    [index.byFullName, "full-name"] as const,
    [index.byLastName, "last-name"] as const,
  ]) {
    const key = via === "full-name" ? normalized : lastNameOf(normalized);
    const candidates = map.get(key);
    if (!candidates || candidates.length === 0) continue;

    const narrowed =
      teamId && candidates.length > 1
        ? candidates.filter((player) => player.realTeamId === teamId)
        : candidates;

    if (narrowed.length === 1) {
      return { status: "matched", playerId: narrowed[0]!.id, via };
    }
    if (narrowed.length > 1) {
      return {
        status: "ambiguous",
        candidates: narrowed.map((player) => player.id),
      };
    }
  }

  return { status: "not-found" };
}
