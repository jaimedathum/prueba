/**
 * Puerta de las reglas del juego sin confirmar.
 *
 * Los motores de decisión dependen de números que todavía no se han verificado
 * (ver docs/reglas.md). En vez de elegir un valor plausible y dejar que las
 * recomendaciones salgan con una precisión que no tienen, cada uno se declara
 * aquí de forma explícita: o está configurado, o el motor que lo necesita se
 * niega a funcionar y dice exactamente qué falta y cómo averiguarlo.
 *
 * Una recomendación calculada sobre una regla inventada es peor que no dar
 * recomendación, porque parece igual de convincente.
 */

export class UnconfirmedRuleError extends Error {
  constructor(
    readonly rule: string,
    readonly envVar: string,
    howToFind: string,
  ) {
    super(
      `Regla del juego sin confirmar: ${rule}.\n` +
        `Configura ${envVar} en .env.\n` +
        `Cómo averiguarlo: ${howToFind}\n` +
        `Ver docs/reglas.md.`,
    );
    this.name = "UnconfirmedRuleError";
  }
}

function readNumber(envVar: string): number | null {
  const raw = process.env[envVar];
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------------ *
 * Regla nº 1 — coste del blindaje
 * ------------------------------------------------------------------ */

export interface ShieldingRules {
  /**
   * Cuánto sube la cláusula por cada euro invertido en blindar.
   * Es la `k` de la fórmula de blindaje, y el número del que depende por
   * completo esa recomendación.
   */
  clauseMultiplier: number;
}

/**
 * Cuánto sube la cláusula por cada euro pagado al blindar.
 *
 * **Confirmado en la app oficial**: pagar 10M sobre una cláusula de 30M la
 * deja en 50M, es decir `C + 2·Δ`. Coincide exactamente con la semántica que
 * ya asumía la fórmula de blindaje, así que no hubo que tocarla.
 *
 * Sigue siendo configurable porque una liga privada podría cambiarlo y porque
 * el juego podría retocarlo entre temporadas.
 */
export const DEFAULT_CLAUSE_MULTIPLIER = 2;

export function requireShieldingRules(
  override?: Partial<ShieldingRules>,
): ShieldingRules {
  const multiplier =
    override?.clauseMultiplier ??
    readNumber("FANTASY_CLAUSE_MULTIPLIER") ??
    DEFAULT_CLAUSE_MULTIPLIER;

  if (multiplier === null) {
    throw new UnconfirmedRuleError(
      "multiplicador de blindaje",
      "FANTASY_CLAUSE_MULTIPLIER",
      "blinda a un jugador barato en la app oficial y mira cuánto sube su " +
        "cláusula por cada euro pagado",
    );
  }
  if (multiplier <= 0) {
    throw new Error(
      `FANTASY_CLAUSE_MULTIPLIER debe ser positivo, es ${multiplier}`,
    );
  }
  return { clauseMultiplier: multiplier };
}

/* ------------------------------------------------------------------ *
 * Presupuesto inicial
 * ------------------------------------------------------------------ */

/**
 * 200M es el valor de referencia publicado. Se deja configurable porque las
 * ligas privadas pueden cambiarlo, y porque el motor de caja lo calibra
 * después contra el saldo propio: un presupuesto inicial equivocado se
 * detecta solo, en el residuo de la calibración.
 */
export const DEFAULT_INITIAL_BUDGET = 200_000_000;

export function initialBudget(): number {
  return readNumber("FANTASY_INITIAL_BUDGET") ?? DEFAULT_INITIAL_BUDGET;
}
