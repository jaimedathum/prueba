/**
 * Modelo Dixon-Coles de fuerza de equipos.
 *
 * Es la base de los puntos esperados. Sustituye la típica "dificultad del
 * rival del 1 al 5" por números con significado:
 *
 *     λ_local     = exp(μ + ataque_local     + defensa_visitante + ventaja_local)
 *     λ_visitante = exp(μ + ataque_visitante + defensa_local)
 *
 * De ahí sale directamente `P(portería a cero) = P(el rival marca 0)`, que es
 * el mayor determinante de los puntos de porteros y defensas — justo la parte
 * que peor se estima a ojo.
 *
 * Sobre el ajuste: los parámetros de ataque, defensa, base y ventaja local se
 * estiman por ascenso de gradiente con gradientes analíticos de la parte
 * Poisson. La corrección de marcadores bajos de Dixon-Coles (`ρ`) se ajusta
 * después en una segunda pasada por búsqueda unidimensional sobre la
 * verosimilitud completa. Es una aproximación deliberada: `ρ` solo afecta a
 * cuatro celdas (0-0, 0-1, 1-0, 1-1) y su influencia sobre ataque y defensa es
 * de segundo orden, así que separar las dos etapas simplifica mucho el código
 * sin coste apreciable de ajuste.
 */

export interface MatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  playedAt: Date;
}

export interface TeamStrength {
  teamId: string;
  /** Positivo = marca más de lo normal. */
  attack: number;
  /** Positivo = encaja más de lo normal (o sea, defiende peor). */
  defense: number;
}

export interface TeamModel {
  teams: Map<string, TeamStrength>;
  baseRate: number;
  homeAdvantage: number;
  rho: number;
  logLikelihood: number;
  matches: number;
  /** Partidos usados: por debajo de unos cuantos, el modelo no vale gran cosa. */
  converged: boolean;
}

export interface FitOptions {
  /**
   * Vida media del peso de un partido. A 180 días, un partido de hace medio
   * año pesa la mitad que uno de hoy.
   */
  halfLifeDays?: number;
  iterations?: number;
  learningRate?: number;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GOALS = 10;

/** Peso por antigüedad: lo reciente informa más de la forma actual. */
export function timeWeight(
  playedAt: Date,
  now: Date,
  halfLifeDays: number,
): number {
  const days = Math.max(0, (now.getTime() - playedAt.getTime()) / DAY_MS);
  return Math.exp((-Math.LN2 * days) / halfLifeDays);
}

/**
 * Corrección de Dixon-Coles para marcadores bajos. Un Poisson independiente
 * subestima los empates a cero y a uno, que en fútbol son más frecuentes de lo
 * que predice el modelo puro.
 */
export function tau(
  x: number,
  y: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

function logFactorial(n: number): number {
  let total = 0;
  for (let i = 2; i <= n; i++) total += Math.log(i);
  return total;
}

function poissonPmf(k: number, lambda: number): number {
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}

export function fitTeamModel(
  matches: MatchResult[],
  options: FitOptions = {},
): TeamModel {
  const halfLifeDays = options.halfLifeDays ?? 180;
  const iterations = options.iterations ?? 2000;
  const learningRate = options.learningRate ?? 0.02;
  const now = options.now ?? new Date();

  const teamIds = [
    ...new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
  ].sort();

  const attack = new Map<string, number>(teamIds.map((id) => [id, 0]));
  const defense = new Map<string, number>(teamIds.map((id) => [id, 0]));

  const weights = matches.map((m) => timeWeight(m.playedAt, now, halfLifeDays));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  if (matches.length === 0 || totalWeight === 0) {
    return {
      teams: new Map(),
      baseRate: 0,
      homeAdvantage: 0,
      rho: 0,
      logLikelihood: 0,
      matches: 0,
      converged: false,
    };
  }

  // Arranque razonable: media ponderada de goles por partido y por lado.
  const weightedGoals = matches.reduce(
    (acc, m, i) => acc + weights[i]! * (m.homeGoals + m.awayGoals),
    0,
  );
  let baseRate = Math.log(Math.max(0.1, weightedGoals / (2 * totalWeight)));
  let homeAdvantage = 0.25;

  for (let step = 0; step < iterations; step++) {
    const gradAttack = new Map<string, number>(teamIds.map((id) => [id, 0]));
    const gradDefense = new Map<string, number>(teamIds.map((id) => [id, 0]));
    let gradBase = 0;
    let gradHome = 0;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!;
      const w = weights[i]!;

      const lambdaHome = Math.exp(
        baseRate +
          attack.get(match.homeTeamId)! +
          defense.get(match.awayTeamId)! +
          homeAdvantage,
      );
      const lambdaAway = Math.exp(
        baseRate +
          attack.get(match.awayTeamId)! +
          defense.get(match.homeTeamId)!,
      );

      // d/dθ [ x·log λ − λ ] = (x − λ) cuando λ = exp(…+θ+…)
      const residualHome = w * (match.homeGoals - lambdaHome);
      const residualAway = w * (match.awayGoals - lambdaAway);

      gradAttack.set(
        match.homeTeamId,
        gradAttack.get(match.homeTeamId)! + residualHome,
      );
      gradDefense.set(
        match.awayTeamId,
        gradDefense.get(match.awayTeamId)! + residualHome,
      );
      gradAttack.set(
        match.awayTeamId,
        gradAttack.get(match.awayTeamId)! + residualAway,
      );
      gradDefense.set(
        match.homeTeamId,
        gradDefense.get(match.homeTeamId)! + residualAway,
      );

      gradBase += residualHome + residualAway;
      gradHome += residualHome;
    }

    const scale = learningRate / totalWeight;
    for (const id of teamIds) {
      attack.set(id, attack.get(id)! + scale * gradAttack.get(id)!);
      defense.set(id, defense.get(id)! + scale * gradDefense.get(id)!);
    }
    baseRate += scale * gradBase;
    homeAdvantage += scale * gradHome;

    // Identificabilidad: ataque y defensa solo están definidos salvo una
    // constante, que se absorbe en `baseRate`. Sin centrar, los parámetros
    // derivan sin fin y el ajuste no converge.
    recenter(attack, teamIds);
    recenter(defense, teamIds);
  }

  const rho = fitRho(matches, weights, attack, defense, baseRate, homeAdvantage);

  const teams = new Map<string, TeamStrength>(
    teamIds.map((id) => [
      id,
      { teamId: id, attack: attack.get(id)!, defense: defense.get(id)! },
    ]),
  );

  const model: TeamModel = {
    teams,
    baseRate,
    homeAdvantage,
    rho,
    logLikelihood: 0,
    matches: matches.length,
    converged: matches.length >= teamIds.length * 2,
  };
  model.logLikelihood = logLikelihood(model, matches, weights);

  return model;
}

function recenter(values: Map<string, number>, ids: string[]): void {
  const mean = ids.reduce((acc, id) => acc + values.get(id)!, 0) / ids.length;
  for (const id of ids) values.set(id, values.get(id)! - mean);
}

/** Segunda etapa: `ρ` por búsqueda unidimensional sobre la verosimilitud completa. */
function fitRho(
  matches: MatchResult[],
  weights: number[],
  attack: Map<string, number>,
  defense: Map<string, number>,
  baseRate: number,
  homeAdvantage: number,
): number {
  let best = 0;
  let bestLL = -Infinity;

  for (let candidate = -0.3; candidate <= 0.3001; candidate += 0.01) {
    let ll = 0;
    let valid = true;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!;
      const lambdaHome = Math.exp(
        baseRate +
          attack.get(match.homeTeamId)! +
          defense.get(match.awayTeamId)! +
          homeAdvantage,
      );
      const lambdaAway = Math.exp(
        baseRate + attack.get(match.awayTeamId)! + defense.get(match.homeTeamId)!,
      );
      const correction = tau(
        match.homeGoals,
        match.awayGoals,
        lambdaHome,
        lambdaAway,
        candidate,
      );
      // Un ρ que da probabilidad negativa a un marcador observado es inválido.
      if (correction <= 0) {
        valid = false;
        break;
      }
      ll += weights[i]! * Math.log(correction);
    }

    if (valid && ll > bestLL) {
      bestLL = ll;
      best = candidate;
    }
  }

  return best;
}

export function logLikelihood(
  model: TeamModel,
  matches: MatchResult[],
  weights?: number[],
): number {
  let total = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const w = weights?.[i] ?? 1;
    const { lambdaHome, lambdaAway } = rates(
      model,
      match.homeTeamId,
      match.awayTeamId,
    );
    const correction = tau(
      match.homeGoals,
      match.awayGoals,
      lambdaHome,
      lambdaAway,
      model.rho,
    );
    total +=
      w *
      (Math.log(Math.max(1e-12, poissonPmf(match.homeGoals, lambdaHome))) +
        Math.log(Math.max(1e-12, poissonPmf(match.awayGoals, lambdaAway))) +
        Math.log(Math.max(1e-12, correction)));
  }
  return total;
}

/**
 * Línea base honesta contra la que comparar: todos los equipos iguales, con la
 * media de goles de la liga. Si el modelo no bate esto, no se usa.
 */
export function baselineLogLikelihood(matches: MatchResult[]): number {
  if (matches.length === 0) return 0;
  const meanHome =
    matches.reduce((acc, m) => acc + m.homeGoals, 0) / matches.length;
  const meanAway =
    matches.reduce((acc, m) => acc + m.awayGoals, 0) / matches.length;

  return matches.reduce(
    (acc, m) =>
      acc +
      Math.log(Math.max(1e-12, poissonPmf(m.homeGoals, Math.max(0.01, meanHome)))) +
      Math.log(Math.max(1e-12, poissonPmf(m.awayGoals, Math.max(0.01, meanAway)))),
    0,
  );
}

function rates(
  model: TeamModel,
  homeTeamId: string,
  awayTeamId: string,
): { lambdaHome: number; lambdaAway: number } {
  const home = model.teams.get(homeTeamId);
  const away = model.teams.get(awayTeamId);

  // Un equipo desconocido (recién ascendido, o un id que no casa) se trata
  // como promedio en vez de reventar: la proyección pierde precisión, no se
  // cae.
  const attackHome = home?.attack ?? 0;
  const defenseHome = home?.defense ?? 0;
  const attackAway = away?.attack ?? 0;
  const defenseAway = away?.defense ?? 0;

  return {
    lambdaHome: Math.exp(
      model.baseRate + attackHome + defenseAway + model.homeAdvantage,
    ),
    lambdaAway: Math.exp(model.baseRate + attackAway + defenseHome),
  };
}

export interface MatchPrediction {
  homeTeamId: string;
  awayTeamId: string;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  /** Probabilidad de que el LOCAL deje la portería a cero. */
  homeCleanSheet: number;
  awayCleanSheet: number;
  homeWin: number;
  draw: number;
  awayWin: number;
}

export function predictMatch(
  model: TeamModel,
  homeTeamId: string,
  awayTeamId: string,
): MatchPrediction {
  const { lambdaHome, lambdaAway } = rates(model, homeTeamId, awayTeamId);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let homeCleanSheet = 0;
  let awayCleanSheet = 0;

  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      const probability =
        poissonPmf(x, lambdaHome) *
        poissonPmf(y, lambdaAway) *
        tau(x, y, lambdaHome, lambdaAway, model.rho);

      if (x > y) homeWin += probability;
      else if (x === y) draw += probability;
      else awayWin += probability;

      // Portería a cero del local = el visitante no marca.
      if (y === 0) homeCleanSheet += probability;
      if (x === 0) awayCleanSheet += probability;
    }
  }

  return {
    homeTeamId,
    awayTeamId,
    expectedHomeGoals: lambdaHome,
    expectedAwayGoals: lambdaAway,
    homeCleanSheet,
    awayCleanSheet,
    homeWin,
    draw,
    awayWin,
  };
}

/** Vista desde un equipo concreto, que es como lo necesitan los puntos esperados. */
export interface TeamOutlook {
  teamId: string;
  opponentId: string;
  isHome: boolean;
  expectedGoalsFor: number;
  expectedGoalsAgainst: number;
  cleanSheetProbability: number;
  winProbability: number;
  drawProbability: number;
}

export function outlookFor(
  model: TeamModel,
  teamId: string,
  opponentId: string,
  isHome: boolean,
): TeamOutlook {
  const prediction = isHome
    ? predictMatch(model, teamId, opponentId)
    : predictMatch(model, opponentId, teamId);

  return {
    teamId,
    opponentId,
    isHome,
    expectedGoalsFor: isHome
      ? prediction.expectedHomeGoals
      : prediction.expectedAwayGoals,
    expectedGoalsAgainst: isHome
      ? prediction.expectedAwayGoals
      : prediction.expectedHomeGoals,
    cleanSheetProbability: isHome
      ? prediction.homeCleanSheet
      : prediction.awayCleanSheet,
    winProbability: isHome ? prediction.homeWin : prediction.awayWin,
    drawProbability: prediction.draw,
  };
}
