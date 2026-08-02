/**
 * Interfaz común de las fuentes secundarias.
 *
 * La API del juego no dice quién va a ser titular ni quién está lesionado, y
 * eso es justo lo que más pesa en los puntos esperados. Cada fuente externa
 * (JornadaPerfecta, FútbolFantasy, ...) se implementa detrás de esta interfaz
 * para que el motor no sepa —ni le importe— de dónde viene cada voto.
 */

export interface ProbableLineupEntry {
  /** Nombre tal cual lo publica la fuente; el emparejamiento va aparte. */
  playerName: string;
  teamName: string | null;
  starter: boolean;
  /** 0-100 si la fuente la publica; null si solo dice sí/no. */
  confidence: number | null;
}

export interface InjuryEntry {
  playerName: string;
  teamName: string | null;
  /** 'injured' | 'doubtful' | 'suspended' | 'ok' */
  status: string;
  detail: string | null;
  expectedReturn: string | null;
}

export interface SourceResult<T> {
  source: string;
  entries: T[];
  fetchedAt: Date;
}

export interface ProbableLineupSource {
  readonly name: string;
  fetchProbableLineups(matchday: number): Promise<SourceResult<ProbableLineupEntry>>;
}

export interface InjurySource {
  readonly name: string;
  fetchInjuries(): Promise<SourceResult<InjuryEntry>>;
}

export class SourceUnavailableError extends Error {
  constructor(
    readonly source: string,
    cause: unknown,
  ) {
    super(
      `La fuente ${source} no está disponible: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "SourceUnavailableError";
  }
}
