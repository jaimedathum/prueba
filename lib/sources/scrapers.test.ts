import { describe, expect, it, vi } from "vitest";
import {
  JornadaPerfectaSource,
  normalizeInjuryStatus,
  parseInjuries,
  parseProbableLineups,
} from "./jornadaperfecta";
import { clearScrapeCache, fetchHtml } from "./scrape";
import { gatherProbableLineups } from "./registry";
import type { ProbableLineupSource, SourceResult } from "./types";
import type { ProbableLineupEntry } from "./types";

/**
 * Fixtures propias: el entorno no tiene salida a los dominios reales, así que
 * estos tests validan la lógica de extracción, no el marcado remoto. Cuando se
 * confirmen los selectores contra el HTML real, basta sustituir estas fixtures
 * por una captura y los tests siguen sirviendo.
 */
const LINEUP_HTML = `
<html><body>
  <div class="once-equipo">
    <h2 class="nombre-equipo">Real Madrid</h2>
    <ul>
      <li class="titular"><span class="nombre">Courtois</span></li>
      <li class="titular"><span class="nombre">Vinícius Júnior</span></li>
      <li class="duda"><span class="nombre">Camavinga</span></li>
    </ul>
  </div>
  <div class="once-equipo">
    <h2 class="nombre-equipo">Barcelona</h2>
    <ul>
      <li class="titular"><span class="nombre">Lewandowski</span></li>
    </ul>
  </div>
</body></html>`;

const INJURY_HTML = `
<html><body><table>
  <tr><td class="nombre">Gavi</td><td class="estado">Lesionado</td><td class="dolencia">Rodilla</td><td class="vuelta">2026-09-01</td></tr>
  <tr><td class="nombre">Militao</td><td class="estado">Duda</td><td class="dolencia">Molestias</td><td class="vuelta"></td></tr>
  <tr><td class="nombre">Araujo</td><td class="estado">Sancionado</td><td class="dolencia">Roja</td><td class="vuelta"></td></tr>
</table></body></html>`;

describe("parseProbableLineups (JornadaPerfecta)", () => {
  it("extrae titulares con su equipo", () => {
    const entries = parseProbableLineups(LINEUP_HTML);
    const titulares = entries.filter((e) => e.starter);
    expect(titulares).toHaveLength(3);
    expect(titulares[0]).toMatchObject({
      playerName: "Courtois",
      teamName: "Real Madrid",
      starter: true,
    });
  });

  it("las dudas no cuentan como titulares confirmados", () => {
    const entries = parseProbableLineups(LINEUP_HTML);
    const duda = entries.find((e) => e.playerName === "Camavinga");
    // Entra con probabilidad media, que es lo honesto: ni sí ni no.
    expect(duda).toMatchObject({ starter: false, confidence: 50 });
  });

  it("devuelve lista vacía ante HTML que no reconoce, sin reventar", () => {
    expect(parseProbableLineups("<html><body><p>nada</p></body></html>")).toEqual(
      [],
    );
  });
});

describe("parseInjuries (JornadaPerfecta)", () => {
  it("extrae estado, dolencia y fecha de vuelta", () => {
    const entries = parseInjuries(INJURY_HTML);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      playerName: "Gavi",
      status: "injured",
      detail: "Rodilla",
      expectedReturn: "2026-09-01",
    });
  });

  it("distingue lesión, duda y sanción", () => {
    const entries = parseInjuries(INJURY_HTML);
    expect(entries.map((e) => e.status)).toEqual([
      "injured",
      "doubtful",
      "suspended",
    ]);
  });
});

describe("normalizeInjuryStatus", () => {
  it("ante un texto desconocido asume lesión, que es el lado seguro", () => {
    // Equivocarse marcando disponible a un lesionado cuesta puntos;
    // al revés, solo cuesta un cambio innecesario.
    expect(normalizeInjuryStatus("texto raro")).toBe("injured");
  });
});

describe("fetchHtml", () => {
  it("cachea para no castigar a webs gratuitas", async () => {
    clearScrapeCache();
    const fetchImpl = vi.fn(async () => new Response("<html>ok</html>"));
    const url = "https://ejemplo.test/pagina";

    await fetchHtml(url, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await fetchHtml(url, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("vuelve a pedir cuando expira el TTL", async () => {
    clearScrapeCache();
    const fetchImpl = vi.fn(async () => new Response("<html>ok</html>"));
    const url = "https://ejemplo.test/otra";
    let ahora = 0;
    const options = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 1000,
      now: () => ahora,
    };

    await fetchHtml(url, options);
    ahora = 2000;
    await fetchHtml(url, options);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

/* --- Degradación elegante ------------------------------------------ */

function fakeSource(
  name: string,
  behaviour: "ok" | "empty" | "throw",
): ProbableLineupSource {
  return {
    name,
    async fetchProbableLineups(): Promise<SourceResult<ProbableLineupEntry>> {
      if (behaviour === "throw") throw new Error("caída");
      return {
        source: name,
        entries:
          behaviour === "empty"
            ? []
            : [
                {
                  playerName: "Jugador",
                  teamName: null,
                  starter: true,
                  confidence: null,
                },
              ],
        fetchedAt: new Date(),
      };
    },
  };
}

describe("gatherProbableLineups", () => {
  it("sigue con el resto cuando una fuente cae", async () => {
    const { results, failures } = await gatherProbableLineups(1, [
      fakeSource("buena", "ok"),
      fakeSource("caida", "throw"),
    ]);
    expect(results).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.source).toBe("caida");
  });

  it("trata como caída una fuente que responde pero no devuelve nada", async () => {
    // Un 200 con cero jugadores significa selectores rotos, no que no juegue
    // nadie. Confundir las dos cosas envenenaría la proyección entera.
    const { results, failures } = await gatherProbableLineups(1, [
      fakeSource("vacia", "empty"),
    ]);
    expect(results).toHaveLength(0);
    expect(failures[0]!.message).toMatch(/selectores/);
  });

  it("si caen todas, devuelve cero votos en vez de fallar", async () => {
    const { results, failures } = await gatherProbableLineups(1, [
      fakeSource("a", "throw"),
      fakeSource("b", "throw"),
    ]);
    expect(results).toHaveLength(0);
    expect(failures).toHaveLength(2);
  });
});

describe("JornadaPerfectaSource", () => {
  it("devuelve entradas con el nombre de la fuente", async () => {
    clearScrapeCache();
    const fetchImpl = vi.fn(async () => new Response(LINEUP_HTML));
    const source = new JornadaPerfectaSource(fetchImpl as unknown as typeof fetch);
    const result = await source.fetchProbableLineups(1);
    expect(result.source).toBe("jornadaperfecta");
    expect(result.entries.length).toBeGreaterThan(0);
  });
});
