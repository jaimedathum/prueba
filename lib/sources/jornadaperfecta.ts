import * as cheerio from "cheerio";
import { fetchHtml } from "./scrape";
import type {
  InjuryEntry,
  InjurySource,
  ProbableLineupEntry,
  ProbableLineupSource,
  SourceResult,
} from "./types";

/**
 * Adaptador de JornadaPerfecta.
 *
 * Publica onces probables desde hace más de nueve temporadas y lesionados
 * actualizados al minuto con fecha estimada de retorno, que es exactamente lo
 * que la API del juego no da.
 *
 * AVISO SOBRE LOS SELECTORES
 * --------------------------
 * Los selectores CSS de abajo NO están verificados contra el HTML real: el
 * entorno de desarrollo no tiene salida a ese dominio. Están aislados en
 * `SELECTORS` y en las funciones `parse*` precisamente para que confirmarlos
 * sea abrir la página, mirar el marcado y tocar un único sitio. Los tests usan
 * fixtures propias, así que validan la lógica de extracción, no el marcado
 * remoto.
 *
 * Hasta que se confirmen, `probeSelectors` avisa de que la fuente no está
 * devolviendo nada y el consenso sigue adelante con las demás.
 */

export const JORNADA_PERFECTA = "jornadaperfecta";

const BASE = "https://www.jornadaperfecta.com";

export const URLS = {
  probableLineups: `${BASE}/onces-posibles/`,
  injuries: `${BASE}/lesionados`,
} as const;

/** Punto único de confirmación del marcado. */
export const SELECTORS = {
  lineupTeamBlock: "[data-equipo], .once-equipo, .equipo-once",
  lineupTeamName: ".nombre-equipo, h2, h3",
  lineupStarter: ".titular, .jugador.titular, li.titular",
  lineupDoubt: ".duda, .jugador.duda",
  playerName: ".nombre, .jugador-nombre, span",
  injuryRow: "tr, .lesionado, .jugador-lesionado",
  injuryName: ".nombre, td:first-child",
  injuryStatus: ".estado, td:nth-child(2)",
  injuryDetail: ".dolencia, td:nth-child(3)",
  injuryReturn: ".vuelta, td:nth-child(4)",
} as const;

function text($el: cheerio.Cheerio<never>): string {
  return $el.first().text().replace(/\s+/g, " ").trim();
}

export function parseProbableLineups(html: string): ProbableLineupEntry[] {
  const $ = cheerio.load(html);
  const entries: ProbableLineupEntry[] = [];

  $(SELECTORS.lineupTeamBlock).each((_, block) => {
    const $block = $(block);
    const teamName =
      text($block.find(SELECTORS.lineupTeamName) as never) || null;

    const collect = (selector: string, starter: boolean, confidence: number) => {
      $block.find(selector).each((__, node) => {
        const $node = $(node);
        const name =
          text($node.find(SELECTORS.playerName) as never) ||
          text($node as never);
        if (!name) return;
        entries.push({ playerName: name, teamName, starter, confidence });
      });
    };

    collect(SELECTORS.lineupStarter, true, 85);
    // Las dudas no son titulares confirmados: entran con probabilidad media
    // en vez de contarse como un sí rotundo.
    collect(SELECTORS.lineupDoubt, false, 50);
  });

  return entries;
}

const INJURY_STATUS: ReadonlyArray<[RegExp, string]> = [
  [/sancion/i, "suspended"],
  [/duda|tocado/i, "doubtful"],
  [/lesion|baja|rotura|molestias/i, "injured"],
  [/disponible|apto|ok/i, "ok"],
];

export function normalizeInjuryStatus(raw: string): string {
  for (const [pattern, status] of INJURY_STATUS) {
    if (pattern.test(raw)) return status;
  }
  return "injured";
}

export function parseInjuries(html: string): InjuryEntry[] {
  const $ = cheerio.load(html);
  const entries: InjuryEntry[] = [];

  $(SELECTORS.injuryRow).each((_, row) => {
    const $row = $(row);
    const name = text($row.find(SELECTORS.injuryName) as never);
    if (!name) return;

    const statusText = text($row.find(SELECTORS.injuryStatus) as never);
    const detail = text($row.find(SELECTORS.injuryDetail) as never) || null;
    const expectedReturn =
      text($row.find(SELECTORS.injuryReturn) as never) || null;

    entries.push({
      playerName: name,
      teamName: null,
      status: normalizeInjuryStatus(statusText),
      detail,
      expectedReturn,
    });
  });

  return entries;
}

export class JornadaPerfectaSource
  implements ProbableLineupSource, InjurySource
{
  readonly name = JORNADA_PERFECTA;

  constructor(private readonly fetchImpl?: typeof fetch) {}

  async fetchProbableLineups(
    _matchday?: number,
  ): Promise<SourceResult<ProbableLineupEntry>> {
    // La página publica siempre la jornada en curso, así que el número no
    // entra en la URL; se acepta para cumplir la interfaz común.
    const html = await fetchHtml(URLS.probableLineups, {
      fetchImpl: this.fetchImpl,
    });
    return {
      source: this.name,
      entries: parseProbableLineups(html),
      fetchedAt: new Date(),
    };
  }

  async fetchInjuries(): Promise<SourceResult<InjuryEntry>> {
    const html = await fetchHtml(URLS.injuries, { fetchImpl: this.fetchImpl });
    return {
      source: this.name,
      entries: parseInjuries(html),
      fetchedAt: new Date(),
    };
  }
}
