"use server";

import { safeEqual } from "@/lib/fantasy/crypto";
import { runSync } from "@/lib/ingest/sync";

/**
 * Sincronización a demanda desde el navegador.
 *
 * El cron diario es quien mantiene esto al día, pero hay dos momentos en que
 * hace falta poder dispararlo a mano: justo después del primer login —si no,
 * hay que esperar al día siguiente para ver un solo dato— y cuando se quiere
 * el informe de mapeo, que es lo que cierra la mayoría de incógnitas de
 * docs/reglas.md.
 *
 * Va protegida por `CRON_SECRET`, igual que la ruta de cron a la que sustituye.
 */

export interface SyncState {
  ok: boolean;
  message: string;
  stats?: Array<[string, number]>;
  warnings?: string[];
  shape?: string;
}

export async function runSyncAction(
  _previous: SyncState | null,
  formData: FormData,
): Promise<SyncState> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return {
      ok: false,
      message:
        "CRON_SECRET no está configurado en el despliegue. Añádelo en " +
        "Vercel → Settings → Environment Variables y vuelve a desplegar.",
    };
  }
  if (!safeEqual(String(formData.get("secret") ?? ""), expected)) {
    return { ok: false, message: "Secreto incorrecto." };
  }

  const dryRun = formData.get("dryRun") === "on";
  const shape = formData.get("shape") === "on";

  try {
    const result = await runSync({ persist: !dryRun, collectShape: shape });

    return {
      ok: true,
      message: dryRun
        ? `Lectura completada sin escribir nada. Liga: ${result.leagueId}.`
        : `Sincronización completada. Liga: ${result.leagueId}.`,
      stats: Object.entries(result.stats),
      warnings: result.warnings,
      shape: result.shape?.format(),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
