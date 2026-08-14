"use server";

import { checkAdminSecret, grantAdminSession } from "@/lib/admin-gate";
import { diagnoseApi, type ProbeResult } from "@/lib/fantasy/probe";
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
 * Acertarlo aquí **desbloquea también el resto de acciones privilegiadas** en
 * este navegador (ver `lib/admin-gate.ts`), que es lo que permite que el botón
 * de la cabecera no tenga que pedir el secreto en cada pulsación.
 */

export interface SyncState {
  ok: boolean;
  message: string;
  stats?: Array<[string, number]>;
  warnings?: string[];
  shape?: string;
}

export interface DiagnosisState {
  ok: boolean;
  message: string;
  results?: ProbeResult[];
  me?: string;
}

/**
 * Diagnóstico de la API, para cuando la sincronización falla con un código
 * que no dice dónde está el problema.
 */
export async function diagnoseAction(
  _previous: DiagnosisState | null,
  formData: FormData,
): Promise<DiagnosisState> {
  const gate = checkAdminSecret(String(formData.get("secret") ?? ""));
  if (!gate.ok) return { ok: false, message: gate.message };
  await grantAdminSession();

  try {
    const diagnosis = await diagnoseApi();
    return {
      ok: diagnosis.workingBase !== null,
      message: diagnosis.conclusion,
      // Sin cuerpos: solo la ruta y el código, que es lo que diagnostica.
      results: diagnosis.results.map(({ base, path, status, error }) => ({
        base,
        path,
        status,
        error,
      })),
      // La respuesta de /v4/user/me lleva dentro los identificadores de liga y
      // de equipo, que es justo lo que hay que configurar después.
      me: diagnosis.me ? JSON.stringify(diagnosis.me, null, 2) : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSyncAction(
  _previous: SyncState | null,
  formData: FormData,
): Promise<SyncState> {
  const gate = checkAdminSecret(String(formData.get("secret") ?? ""));
  if (!gate.ok) return { ok: false, message: gate.message };
  await grantAdminSession();

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
