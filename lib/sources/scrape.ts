/**
 * Utilidades comunes de scraping.
 *
 * Las fuentes secundarias son webs gratuitas que hacen un trabajo enorme; se
 * las trata en consecuencia: caché agresiva, una petición cada vez, y nunca
 * más de lo necesario. Si una fuente cae, la app sigue funcionando con menos
 * confianza en vez de romperse.
 */

const USER_AGENT =
  "fantasy-advisor/0.1 (uso personal; una peticion cada varias horas)";

interface CacheEntry {
  body: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Los onces probables cambian poco: media hora de caché sobra. */
export const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface FetchHtmlOptions {
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<string> {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;
  const doFetch = options.fetchImpl ?? fetch;

  const cached = cache.get(url);
  if (cached && now() - cached.fetchedAt < ttl) {
    return cached.body;
  }

  const response = await doFetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`${url} respondió ${response.status}`);
  }

  const body = await response.text();
  cache.set(url, { body, fetchedAt: now() });
  return body;
}

export function clearScrapeCache(): void {
  cache.clear();
}
