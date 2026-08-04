/**
 * Escala de riesgo de 1 a 6.
 *
 * Traduce una probabilidad a algo que se lee de un vistazo. Dos decisiones
 * que importan:
 *
 * - **Los tramos no son iguales.** Pasar del 5% al 15% de probabilidad de
 *   perder dinero cambia la decisión; pasar del 75% al 85% no, porque en
 *   ambos casos no compras. Los tramos se estrechan donde se decide.
 * - **La confianza viaja aparte.** Un 1 calculado con dos semanas de datos y
 *   un 1 calculado con un modelo validado no valen lo mismo, y enseñarlos
 *   igual sería justo el tipo de cifra estrecha e inventada que este proyecto
 *   evita. Cuando el modelo de detrás no es fiable, se dice.
 */

export type RiskScore = 1 | 2 | 3 | 4 | 5 | 6;

export interface RiskLevel {
  score: RiskScore;
  label: string;
  /** false = el modelo de detrás no da todavía para fiarse del número. */
  confident: boolean;
}

const BANDS: Array<{ below: number; score: RiskScore; label: string }> = [
  { below: 0.1, score: 1, label: "muy bajo" },
  { below: 0.25, score: 2, label: "bajo" },
  { below: 0.4, score: 3, label: "moderado" },
  { below: 0.55, score: 4, label: "alto" },
  { below: 0.75, score: 5, label: "muy alto" },
  { below: Infinity, score: 6, label: "extremo" },
];

/**
 * `probability` es la de que salga mal: perder dinero, o no puntuar.
 * `confident` debe ser false cuando el modelo que la produjo no está validado.
 */
export function riskLevel(probability: number, confident = true): RiskLevel {
  // Una probabilidad fuera de [0,1] es un error de cálculo, no un riesgo
  // extremo: se acota en vez de propagarse como si fuera un dato.
  const p = Math.min(1, Math.max(0, probability));
  const band = BANDS.find((b) => p < b.below) ?? BANDS[BANDS.length - 1]!;

  return { score: band.score, label: band.label, confident };
}

/** Para pintar la escala: seis puntos, los ocupados hasta `score`. */
export function riskDots(score: RiskScore): string {
  return "●".repeat(score) + "○".repeat(6 - score);
}
