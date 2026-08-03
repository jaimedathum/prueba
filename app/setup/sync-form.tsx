"use client";

import { useActionState } from "react";
import { runSyncAction, type SyncState } from "./actions";

/**
 * Disparador manual de la sincronización. El resultado se enseña entero
 * —contadores, avisos e informe de mapeo— porque es justo lo que hace falta
 * para saber si la ingesta va bien o si un parser está fallando en silencio.
 */
export function SyncForm() {
  const [state, formAction, pending] = useActionState<SyncState | null, FormData>(
    runSyncAction,
    null,
  );

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <header>
        <h2 className="font-medium">Sincronizar ahora</h2>
        <p className="text-sm text-neutral-500">
          El cron lo hace solo cada día, pero después del primer login conviene
          lanzarlo a mano para no esperar 24 horas.
        </p>
      </header>

      <form action={formAction} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Secreto del despliegue</span>
          <input
            name="secret"
            type="password"
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input name="dryRun" type="checkbox" className="mt-1" />
          <span>
            Solo lectura
            <span className="block text-xs text-neutral-500">
              Lee de la API pero no escribe nada. Útil para la primera prueba.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input name="shape" type="checkbox" defaultChecked className="mt-1" />
          <span>
            Informe de mapeo de campos
            <span className="block text-xs text-neutral-500">
              Qué campos no se encontraron y cuáles llegan sin que nadie los
              lea. Es lo que cierra las incógnitas de <code>docs/reglas.md</code>.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? "Sincronizando…" : "Sincronizar"}
        </button>

        {pending && (
          <p className="text-xs text-neutral-500">
            Puede tardar un minuto: las peticiones van en serie y con pausa
            entre ellas, a propósito.
          </p>
        )}
      </form>

      {state && <Result state={state} />}
    </section>
  );
}

function Result({ state }: { state: SyncState }) {
  return (
    <div className="space-y-3">
      <pre
        className={`overflow-x-auto whitespace-pre-wrap rounded-lg border p-3 text-sm ${
          state.ok
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        }`}
      >
        {state.message}
      </pre>

      {state.stats && state.stats.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {state.stats.map(([key, value]) => (
              <tr key={key} className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-4 text-neutral-500">{key}</td>
                <td className="py-1 text-right tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state.warnings && state.warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Avisos</p>
          <ul className="list-disc space-y-1 pl-5">
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {state.shape && (
        <details className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <summary className="cursor-pointer font-medium">
            Informe de mapeo de campos
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
            {state.shape}
          </pre>
        </details>
      )}
    </div>
  );
}
