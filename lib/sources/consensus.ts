/**
 * Consenso entre fuentes, ponderado por acierto MEDIDO.
 *
 * Ninguna fuente entra con el peso que ella misma se atribuye: JornadaPerfecta
 * declara un 85-90% de acierto y puede que sea cierto, pero el peso que se le
 * da aquí sale de comparar sus predicciones pasadas con lo que ocurrió de
 * verdad, guardado en `lineup_predictions`.
 */

export interface SourceVote {
  source: string;
  /** Probabilidad que aporta la fuente: 1/0 si solo dice sí o no. */
  probability: number;
}

export interface SourceAccuracy {
  source: string;
  /** Predicciones ya contrastadas contra el resultado real. */
  samples: number;
  /** Aciertos entre las contrastadas. */
  hits: number;
}

/** Fuerza del prior: con menos de ~30 observaciones nadie se gana peso extra. */
const PRIOR_STRENGTH = 30;
const PRIOR_ACCURACY = 0.5;

/**
 * Acierto suavizado hacia 0,5. Una fuente con 3 aciertos de 3 no vale el
 * triple que una con 200 de 240; el shrinkage evita justamente eso.
 */
export function smoothedAccuracy(accuracy: SourceAccuracy): number {
  const { samples, hits } = accuracy;
  if (samples <= 0) return PRIOR_ACCURACY;
  return (
    (hits + PRIOR_STRENGTH * PRIOR_ACCURACY) / (samples + PRIOR_STRENGTH)
  );
}

/**
 * Peso de una fuente. Se descuenta el 0,5 de base porque acertar la mitad de
 * las veces no aporta información: una fuente en el 50% pesa 0.
 */
export function sourceWeight(accuracy: SourceAccuracy): number {
  return Math.max(0, smoothedAccuracy(accuracy) - PRIOR_ACCURACY);
}

export interface ConsensusResult {
  /** Probabilidad combinada de que sea titular. */
  probability: number;
  /** Cuántas fuentes han votado. */
  sources: number;
  /**
   * 1 = acuerdo total, 0 = desacuerdo máximo. Cuando las fuentes discrepan,
   * la app debe enseñarlo en vez de esconderlo tras un número medio.
   */
  agreement: number;
  /** 'high' | 'medium' | 'low' | 'none' */
  confidence: "high" | "medium" | "low" | "none";
  contributors: string[];
}

export function combineVotes(
  votes: SourceVote[],
  accuracies: Map<string, SourceAccuracy>,
): ConsensusResult {
  if (votes.length === 0) {
    return {
      probability: 0,
      sources: 0,
      agreement: 0,
      confidence: "none",
      contributors: [],
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const vote of votes) {
    const accuracy = accuracies.get(vote.source) ?? {
      source: vote.source,
      samples: 0,
      hits: 0,
    };
    // Toda fuente conserva un peso mínimo: si aún no se ha medido a nadie,
    // el consenso sigue siendo la media simple en vez de un cero inútil.
    const weight = sourceWeight(accuracy) + 0.01;
    weightedSum += weight * vote.probability;
    totalWeight += weight;
  }

  const probability = weightedSum / totalWeight;

  // Desviación media respecto al consenso, normalizada a [0,1].
  const spread =
    votes.reduce((acc, v) => acc + Math.abs(v.probability - probability), 0) /
    votes.length;
  const agreement = Math.max(0, 1 - 2 * spread);

  return {
    probability,
    sources: votes.length,
    agreement,
    confidence: confidenceLevel(votes.length, agreement),
    contributors: votes.map((v) => v.source),
  };
}

function confidenceLevel(
  sources: number,
  agreement: number,
): ConsensusResult["confidence"] {
  if (sources === 0) return "none";
  if (sources >= 2 && agreement >= 0.8) return "high";
  if (sources >= 2 || agreement >= 0.8) return "medium";
  return "low";
}

/**
 * Emparejamiento de nombres entre fuentes y la base de datos.
 *
 * Las webs escriben "Vini Jr.", "Vinícius Júnior" o "Vinicius" para el mismo
 * jugador. Se normaliza agresivamente y quien no case se reporta en vez de
 * asignarse al azar: un emparejamiento equivocado es peor que ninguno.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface NameMatchResult {
  matched: Map<string, string>;
  unmatched: string[];
  ambiguous: string[];
}

export function matchNames(
  externalNames: string[],
  known: Array<{ id: string; name: string; nickname: string | null }>,
): NameMatchResult {
  const index = new Map<string, string[]>();
  for (const player of known) {
    for (const variant of [player.name, player.nickname]) {
      if (!variant) continue;
      const key = normalizeName(variant);
      index.set(key, [...(index.get(key) ?? []), player.id]);
    }
  }

  const matched = new Map<string, string>();
  const unmatched: string[] = [];
  const ambiguous: string[] = [];

  for (const external of externalNames) {
    const key = normalizeName(external);
    const exact = index.get(key);

    if (exact?.length === 1) {
      matched.set(external, exact[0]!);
      continue;
    }
    if (exact && exact.length > 1) {
      ambiguous.push(external);
      continue;
    }

    // Segundo intento: coincidencia por apellido único.
    const candidates = [...index.entries()].filter(
      ([indexed]) => indexed.endsWith(` ${key}`) || indexed.startsWith(`${key} `),
    );
    const ids = new Set(candidates.flatMap(([, values]) => values));

    if (ids.size === 1) {
      matched.set(external, [...ids][0]!);
    } else if (ids.size > 1) {
      ambiguous.push(external);
    } else {
      unmatched.push(external);
    }
  }

  return { matched, unmatched, ambiguous };
}
