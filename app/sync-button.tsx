"use client";

import { useActionState } from "react";
import { quickSyncAction, type QuickSyncState } from "./sync-actions";

/**
 * Botón de sincronizar de la barra de navegación.
 *
 * Está aquí y no escondido en una pantalla de configuración porque es la
 * acción que se repite: cada vez que pujas o mueves algo en la app oficial,
 * lo de aquí se queda viejo hasta que se vuelve a leer.
 *
 * El resultado se enseña al lado en vez de en un aviso flotante: dice qué
 * entró, y si algo va mal no desaparece antes de que dé tiempo a leerlo.
 */
export function SyncButton() {
  const [state, action, pending] = useActionState<QuickSyncState | null, FormData>(
    quickSyncAction,
    null,
  );

  return (
    <form action={action} className="ml-auto flex items-center gap-2">
      {state && (
        <span
          className={`hidden text-xs sm:inline ${
            state.ok
              ? "text-neutral-500"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {state.message}
        </span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        {pending ? "Sincronizando…" : "Sincronizar"}
      </button>
    </form>
  );
}
