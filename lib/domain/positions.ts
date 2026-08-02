/**
 * Posiciones del juego.
 *
 * Los identificadores numéricos son los que usa la API. El mapeo está
 * pendiente de confirmar contra datos reales (regla nº 9 de docs/reglas.md);
 * `assertPositionsConfirmed` obliga a hacerlo antes de que ningún motor
 * dependa de ello.
 */
export const POSITIONS = {
  1: "PT",
  2: "DF",
  3: "MC",
  4: "DL",
} as const;

export type PositionId = keyof typeof POSITIONS;
export type PositionCode = (typeof POSITIONS)[PositionId];

export const POSITION_CODES = ["PT", "DF", "MC", "DL"] as const;

export function positionCode(positionId: number): PositionCode | "??" {
  return POSITIONS[positionId as PositionId] ?? "??";
}

export function isPositionId(value: number): value is PositionId {
  return value in POSITIONS;
}

/**
 * Formaciones legales. NO se hardcodean para tomar decisiones: el optimizador
 * las pide a `/v4/teams/lineup/formations`. Esta lista solo sirve de fallback
 * para tests y para la UI cuando la API no responde.
 */
export const FALLBACK_FORMATIONS: ReadonlyArray<Record<PositionCode, number>> = [
  { PT: 1, DF: 3, MC: 4, DL: 3 },
  { PT: 1, DF: 3, MC: 5, DL: 2 },
  { PT: 1, DF: 4, MC: 3, DL: 3 },
  { PT: 1, DF: 4, MC: 4, DL: 2 },
  { PT: 1, DF: 4, MC: 5, DL: 1 },
  { PT: 1, DF: 5, MC: 3, DL: 2 },
  { PT: 1, DF: 5, MC: 4, DL: 1 },
];
