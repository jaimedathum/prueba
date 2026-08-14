"use server";

import { desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-gate";
import { getDb } from "@/lib/db";
import { syncRuns } from "@/lib/db/schema";
import { runSync } from "@/lib/ingest/sync";

/**
 * Sincronización de un clic, desde la barra de navegación.
 *
 * Es la que se usa a diario, después de pujar o de mover la alineación en la
 * app oficial, así que **no puede pedir el secreto en cada pulsación**: eso la
 * haría inservible. Pero tampoco puede quedarse abierta, que es como estaba:
 * la app vive en una URL pública y sin puerta bastaba con que alguien —o un
 * rastreador— pulsara en bucle para lanzar ráfagas de peticiones a LaLiga
 * **con tu token**, y acabar limitado o marcado.
 *
 * La salida a esa disyuntiva es la sesión de administración: el secreto se
 * teclea una vez en `/setup` y este navegador queda desbloqueado. Ver
 * `lib/admin-gate.ts`.
 *
 * El enfriamiento se queda igualmente: protege del doble clic y de tener dos
 * pestañas abiertas, que no son ataques pero gastan peticiones igual.
 *
 * Sigue siendo solo lectura contra el juego: la allowlist de
 * `lib/fantasy/endpoints.ts` no se toca, así que esto no puede pujar,
 * clausular ni blindar por mucho que se pulse.
 */

const COOLDOWN_MS = 2 * 60 * 1000;

export interface QuickSyncState {
  ok: boolean;
  message: string;
}

export async function quickSyncAction(): Promise<QuickSyncState> {
  const gate = await requireAdminSession();
  if (!gate.ok) return { ok: false, message: gate.message };

  const db = getDb();

  const [last] = await db
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  const sinceLast = last ? Date.now() - last.startedAt.getTime() : Infinity;
  if (sinceLast < COOLDOWN_MS) {
    const segundos = Math.ceil((COOLDOWN_MS - sinceLast) / 1000);
    return {
      ok: true,
      message: `Ya se sincronizó hace un momento. Puedes repetir en ${segundos}s.`,
    };
  }

  try {
    const result = await runSync();

    // Los paneles son dinámicos, pero esto fuerza que la navegación posterior
    // vea los datos nuevos sin tener que recargar a mano.
    revalidatePath("/", "layout");

    const avisos = result.warnings.length;
    return {
      ok: true,
      message:
        `Actualizado: ${result.stats.players ?? 0} jugadores, ` +
        `${result.stats.rosterEntries ?? 0} en plantillas, ` +
        `${result.stats.marketListings ?? 0} en el mercado.` +
        (avisos > 0 ? ` ${avisos} aviso(s) en /setup.` : ""),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
