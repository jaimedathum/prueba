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
 * El resultado se enseña de dos formas porque el sitio manda: en escritorio
 * cabe al lado del botón, y en móvil no, así que sale como aviso flotante
 * por encima de la barra de navegación. Truncar el mensaje a puntos
 * suspensivos sería enseñar que ha pasado algo sin decir qué.
 */
export function SyncButton() {
  const [state, action, pending] = useActionState<QuickSyncState | null, FormData>(
    quickSyncAction,
    null,
  );

  return (
    <form action={action} className="flex items-center gap-2.5">
      {state && (
        <span
          className="hidden max-w-[22rem] items-center gap-1.5 truncate text-[12px] lg:inline-flex"
          style={{ color: state.ok ? "var(--color-muted)" : "var(--color-bad)" }}
          title={state.message}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background: state.ok ? "var(--color-good)" : "var(--color-bad)",
            }}
          />
          <span className="truncate">{state.message}</span>
        </span>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="press inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink disabled:cursor-progress disabled:opacity-60"
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
          style={{ color: "var(--color-brand-ink)" }}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="hidden sm:inline">
          {pending ? "Sincronizando" : "Sincronizar"}
        </span>
      </button>

      {/* En móvil, flotando sobre la barra inferior y con el mensaje entero. */}
      {state && (
        <p
          role="status"
          className="fixed inset-x-3 z-40 rounded-control border border-line bg-surface px-3 py-2.5 text-[12px] leading-snug shadow-lg lg:hidden"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)",
            color: state.ok ? "var(--color-muted)" : "var(--color-bad)",
            borderColor: state.ok
              ? "var(--color-line)"
              : "color-mix(in oklab, var(--color-bad) 40%, var(--color-line))",
          }}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
