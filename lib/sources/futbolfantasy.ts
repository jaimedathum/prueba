import * as cheerio from "cheerio";
import { fetchHtml } from "./scrape";
import type {
  ProbableLineupEntry,
  ProbableLineupSource,
  SourceResult,
} from "./types";

/**
 * Adaptador de FútbolFantasy.
 *
 * Segunda voz para los onces probables. Tener dos fuentes independientes no es
 * redundancia: cuando coinciden sube la confianza y cuando discrepan la app lo
 * enseña, que es información valiosa para decidir si arriesgar con un jugador.
 *
 * Misma advertencia que en jornadaperfecta.ts: los selectores están sin
 * verificar contra el HTML real (sin salida a ese dominio desde el entorno de
 * desarrollo) y aislados en `SELECTORS` para que confirmarlos sea trivial.
 */

export const FUTBOL_FANTASY = "futbolfantasy";

const BASE = "https://www.futbolfantasy.com";

export const URLS = {
  probableLineups: `${BASE}/laliga/posibles-alineaciones`,
} as const;

export const SELECTORS = {
  teamBlock: ".equipo, .alineacion, [data-team]",
  teamName: ".nombre-equipo, h2, h3",
  player: ".jugador",
  playerName: ".nombre, span",
  /** Clase que la web pone a quien considera titular probable. */
  starterMarker: "titular",
  probabilityAttr: "data-probabilidad",
} as const;

export function parseProbableLineups(html: string): ProbableLineupEntry[] {
  const $ = cheerio.load(html);
  const entries: ProbableLineupEntry[] = [];

  $(SELECTORS.teamBlock).each((_, block) => {
    const $block = $(block);
    const teamName =
      $block.find(SELECTORS.teamName).first().text().trim() || null;

    $block.find(SELECTORS.player).each((__, node) => {
      const $node = $(node);
      const name =
        $node.find(SELECTORS.playerName).first().text().trim() ||
        $node.text().replace(/\s+/g, " ").trim();
      if (!name) return;

      const rawProbability = $node.attr(SELECTORS.probabilityAttr);
      const parsed = rawProbability ? Number(rawProbability) : NaN;
      const confidence = Number.isFinite(parsed) ? parsed : null;

      entries.push({
        playerName: name,
        teamName,
        starter: $node.hasClass(SELECTORS.starterMarker) || (confidence ?? 0) >= 60,
        confidence,
      });
    });
  });

  return entries;
}

export class FutbolFantasySource implements ProbableLineupSource {
  readonly name = FUTBOL_FANTASY;

  constructor(private readonly fetchImpl?: typeof fetch) {}

  async fetchProbableLineups(
    _matchday?: number,
  ): Promise<SourceResult<ProbableLineupEntry>> {
    const html = await fetchHtml(URLS.probableLineups, {
      fetchImpl: this.fetchImpl,
    });
    return {
      source: this.name,
      entries: parseProbableLineups(html),
      fetchedAt: new Date(),
    };
  }
}
