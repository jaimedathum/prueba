import { describe, expect, it, vi } from "vitest";
import { FantasySession } from "@/lib/fantasy/auth";
import { FantasyClient } from "@/lib/fantasy/client";
import { syncGlobal } from "./sync-global";
import { runSync } from "./sync";

/**
 * Lo que el reparto promete, medido en peticiones.
 *
 * Con el modelo gratuito el coste de todos lo paga el dueño, así que la
 * pregunta que importa no es "¿funciona?" sino **"¿cuántas veces se pide lo
 * mismo?"**. Antes, sincronizar N ligas pedía N veces el catálogo de
 * jugadores y N×38 veces el calendario, y esos son la mayor parte de los
 * ~300 accesos de cada pasada.
 *
 * Estos tests cuentan rutas. Van sin base de datos —`persist: false`— porque
 * lo que se mide es el tráfico contra LaLiga, no lo que se escribe.
 */

/** Cliente que responde vacío a todo y apunta lo que se le pide. */
function spyClient() {
  const paths: string[] = [];

  // Sesión de mentira: sin ella el cliente iría a la base de datos a por el
  // refresh token, y aquí no se mide nada de eso.
  const session = new FantasySession({
    read: async () => ({ refreshToken: "x", policy: null }),
    write: async () => {},
  });
  vi.spyOn(session, "getBearerToken").mockResolvedValue("token-de-prueba");

  const client = new FantasyClient({
    session,
    fetchImpl: vi.fn<typeof fetch>(async () => new Response("[]")),
    minIntervalMs: 0,
    sleepImpl: async () => {},
  });

  const original = client.get.bind(client);
  client.get = ((path: string, query?: Record<string, string | number>) => {
    paths.push(path);
    return original(path, query);
  }) as typeof client.get;

  return { client, paths };
}

const countOf = (paths: string[], fragment: string) =>
  paths.filter((path) => path.includes(fragment)).length;

describe("reparto entre lo global y lo de cada liga", () => {
  it("la mitad global no toca nada de ninguna liga", async () => {
    const { client, paths } = spyClient();
    await syncGlobal({ client, persist: false });

    // Pide el catálogo y la jornada...
    expect(countOf(paths, "/players")).toBe(1);
    expect(countOf(paths, "/week/current")).toBe(1);

    // ...y NADA que dependa de una liga.
    expect(countOf(paths, "/standing")).toBe(0);
    expect(countOf(paths, "/market")).toBe(0);
    expect(countOf(paths, "/activity")).toBe(0);
    expect(countOf(paths, "/leagues")).toBe(0);
  });

  /**
   * El test que justifica la fase entera: con `skipGlobal`, sincronizar una
   * liga más **no vuelve a pedir el catálogo**. Es lo que hace que el coste
   * crezca con el número de ligas y no con el de usuarios.
   */
  it("una liga con skipGlobal no repite el trabajo caro", async () => {
    const { client, paths } = spyClient();
    await runSync({
      client,
      persist: false,
      leagueId: "liga-1",
      skipGlobal: true,
    });

    expect(countOf(paths, "/players")).toBe(0);
    expect(countOf(paths, "/week/current")).toBe(0);
    expect(countOf(paths, "/calendar")).toBe(0);
  });

  it("sin skipGlobal sí lo pide, que es el caso de una sola liga", async () => {
    const { client, paths } = spyClient();
    await runSync({ client, persist: false, leagueId: "liga-1" });

    expect(countOf(paths, "/players")).toBe(1);
  });
});
