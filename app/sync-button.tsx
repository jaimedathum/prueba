"use client";

import { useActionState } from "react";
import { quickSyncAction, type QuickSyncState } from "./sync-actions";

/**
 * Botón de sincronizar de la cabecera.
 *
 * Está siempre visible porque es la acción que se repite: cada vez que pujas
 * o mueves algo en la app oficial, lo de aquí se queda viejo hasta volver a
 * leer.
 *
 * En móvil el texto del resultado no cabe al lado, así que se enseña debajo,
 * a lo ancho de la cabecera, en vez de recortarse a puntos suspensivos.
 */
export function SyncButton() {
  const [state, action, pending] = useActionState<QuickSyncState | null, FormData>(
    quickSyncAction,
    null,
  );

  return (
    <form action={action} className="flex items-center gap-2">
      {state && (
        <span
          className="hidden max-w-xs truncate text-xs lg:inline"
          style={{ color: state.ok ? "var(--muted)" : "var(--bad)" }}
          title={state.message}
        >
          {state.message}
        </span>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="tap inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-opacity disabled:opacity-60"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={pending ? "animate-spin" : ""}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        {pending ? "Sincronizando" : "Sincronizar"}
      </button>

      {/* En móvil, debajo y completo: un mensaje truncado no sirve de nada. */}
      {state && (
        <p
          className="absolute inset-x-0 top-full mt-1 px-4 text-xs lg:hidden"
          style={{ color: state.ok ? "var(--muted)" : "var(--bad)" }}
          role="status"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
