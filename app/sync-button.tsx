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
 * por encima de la tira de secciones. Truncar el mensaje a puntos
 * suspensivos sería enseñar que ha pasado algo sin decir qué.
 */
export function SyncButton() {
  const [state, action, pending] = useActionState<QuickSyncState | null, FormData>(
    quickSyncAction,
    null,
  );

  return (
    <form action={action} className="flex items-center gap-3">
      {state && (
        <span
          className="hidden max-w-[24rem] items-center gap-2 truncate font-mono text-[11px] lg:inline-flex"
          style={{ color: state.ok ? "var(--color-muted)" : "var(--color-bad)" }}
          title={state.message}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0"
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
        className="press inline-flex h-9 items-center gap-2 border border-line-strong px-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink disabled:cursor-progress disabled:opacity-60"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
          aria-hidden
          className={pending ? "animate-spin" : ""}
          style={{ color: "var(--color-brand-ink)" }}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        {pending ? "Leyendo" : "Sincronizar"}
      </button>

      {/* En móvil, flotando sobre la tira inferior y con el mensaje entero. */}
      {state && (
        <p
          role="status"
          className="fixed inset-x-3 z-40 border bg-canvas px-3 py-2.5 text-[12px] leading-snug lg:hidden"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 4rem)",
            color: state.ok ? "var(--color-muted)" : "var(--color-bad)",
            borderColor: state.ok
              ? "var(--color-line-strong)"
              : "var(--color-bad)",
          }}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
