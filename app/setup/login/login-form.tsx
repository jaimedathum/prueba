"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

/**
 * Formulario del login inicial. Cliente solo por el estado de la acción: el
 * trabajo lo hace entero el servidor, y ni la contraseña ni el token llegan a
 * tocar el navegador más allá de este envío.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState | null, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Secreto del despliegue"
        name="secret"
        type="password"
        hint="El valor de CRON_SECRET. Está en Vercel → Settings → Environment Variables."
      />
      <Field
        label="Email de LaLiga Fantasy"
        name="email"
        type="email"
        autoComplete="username"
      />
      <Field
        label="Contraseña de LaLiga Fantasy"
        name="password"
        type="password"
        autoComplete="current-password"
        hint="No se guarda en ninguna parte. Solo se usa para pedir el token."
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Iniciando sesión…" : "Iniciar sesión"}
      </button>

      {state && (
        <pre
          className={`overflow-x-auto whitespace-pre-wrap rounded-lg border p-3 text-sm ${
            state.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          }`}
        >
          {state.message}
        </pre>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  type,
  hint,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  hint?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}
