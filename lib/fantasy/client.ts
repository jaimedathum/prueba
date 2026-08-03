import { API_BASE, isAllowedPath } from "./endpoints";
import { FantasySession } from "./auth";

/**
 * Cliente HTTP de la API del juego.
 *
 * Solo expone `get`. No hay ningún método de escritura, ni una forma de
 * indicar el verbo: pujar, clausular o blindar desde aquí es imposible por
 * construcción, no por convención. Además toda ruta pasa por la allowlist de
 * `endpoints.ts` antes de salir a la red.
 */

export class DisallowedRequestError extends Error {
  constructor(path: string) {
    super(
      `Ruta bloqueada por la allowlist de solo-lectura: ${path}. ` +
        "Si es una ruta de lectura legítima, añádela a ENDPOINT_TEMPLATES. " +
        "Si es de escritura, no: la app recomienda, no ejecuta.",
    );
    this.name = "DisallowedRequestError";
  }
}

export class FantasyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "FantasyApiError";
  }
}

export interface RawRecord {
  endpoint: string;
  params: Record<string, unknown>;
  status: number;
  body: unknown;
}

export interface FantasyClientOptions {
  session?: FantasySession;
  fetchImpl?: typeof fetch;
  /** Pausa mínima entre peticiones. Rate limiting suave y deliberado. */
  minIntervalMs?: number;
  maxRetries?: number;
  /** Se invoca con cada respuesta para volcarla a la capa cruda. */
  onResponse?: (record: RawRecord) => void | Promise<void>;
  /**
   * No sale a la red: valida la ruta y registra la intención en
   * `plannedRequests`. Sirve para comprobar la allowlist sin credenciales.
   * Ojo: NO es el `--dry-run` de la sincronización, que sí lee de la API y lo
   * que evita es escribir en la base de datos.
   */
  offline?: boolean;
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class FantasyClient {
  private readonly session: FantasySession;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly onResponse?: FantasyClientOptions["onResponse"];
  private readonly sleep: (ms: number) => Promise<void>;
  readonly offline: boolean;

  /** Cola serie: nunca se solapan dos peticiones contra la API del juego. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  /** Rutas que se habrían pedido en modo offline. */
  readonly plannedRequests: string[] = [];

  constructor(options: FantasyClientOptions = {}) {
    this.session = options.session ?? new FantasySession();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? 350;
    this.maxRetries = options.maxRetries ?? 4;
    this.onResponse = options.onResponse;
    this.offline = options.offline ?? false;
    this.sleep = options.sleepImpl ?? defaultSleep;
  }

  /**
   * Única forma de hablar con la API. `path` debe estar en la allowlist.
   */
  async get<T = unknown>(
    path: string,
    query: Record<string, string | number> = {},
  ): Promise<T> {
    if (!isAllowedPath(path)) {
      throw new DisallowedRequestError(path);
    }
    return this.enqueue(() => this.execute<T>(path, query));
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    // La cola sigue viva aunque una petición falle.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async execute<T>(
    path: string,
    query: Record<string, string | number>,
  ): Promise<T> {
    const search = new URLSearchParams({ "x-lang": "es" });
    for (const [key, value] of Object.entries(query)) {
      search.set(key, String(value));
    }
    const url = `${API_BASE}${path}?${search.toString()}`;

    if (this.offline) {
      this.plannedRequests.push(`${path}?${search.toString()}`);
      return undefined as T;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.throttle();

      try {
        const token = await this.session.getBearerToken();
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
          },
        });

        if (response.status === 429 || response.status >= 500) {
          lastError = new FantasyApiError(
            `Respuesta ${response.status} en ${path}`,
            response.status,
            path,
          );
          await this.backoff(attempt, response);
          continue;
        }

        const body: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new FantasyApiError(
            `Respuesta ${response.status} en ${path}`,
            response.status,
            path,
          );
        }

        await this.onResponse?.({
          endpoint: path,
          params: query,
          status: response.status,
          body,
        });

        return body as T;
      } catch (error) {
        if (error instanceof FantasyApiError && error.status < 500) throw error;
        lastError = error;
        if (attempt === this.maxRetries) break;
        await this.backoff(attempt);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Fallo al pedir ${path}`);
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await this.sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  /** 2s, 4s, 8s, 16s — respetando Retry-After si el servidor lo manda. */
  private async backoff(attempt: number, response?: Response): Promise<void> {
    const retryAfter = response?.headers.get("retry-after");
    const serverHint = retryAfter ? Number(retryAfter) * 1000 : NaN;
    const delay = Number.isFinite(serverHint)
      ? serverHint
      : 2000 * 2 ** attempt;
    await this.sleep(delay);
  }
}
