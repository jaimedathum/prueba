"use client";

import { useActionState } from "react";
import {
  completeInteractiveLogin,
  loginAction,
  startInteractiveLogin,
  type LoginState,
} from "./actions";

/**
 * Formularios del login inicial. Cliente solo por el estado de las acciones:
 * el trabajo lo hace entero el servidor, y en el flujo interactivo las
 * credenciales ni siquiera pasan por aquí — se teclean en LaLiga.
 */

export function InteractiveLogin() {
  const [start, startForm, starting] = useActionState<LoginState | null, FormData>(
    startInteractiveLogin,
    null,
  );
  const [done, doneForm, finishing] = useActionState<LoginState | null, FormData>(
    completeInteractiveLogin,
    null,
  );

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <header>
        <h2 className="font-medium">Cuenta de Google, Apple o Facebook</h2>
        <p className="text-sm text-neutral-500">
          También sirve para cuentas de email y contraseña. Si no sabes cuál
          tienes, empieza por aquí.
        </p>
      </header>

      <form action={startForm} className="space-y-3">
        <Field label="Secreto del despliegue" name="secret" type="password" />
        <Button pending={starting} idle="Paso 1: generar enlace" busy="Generando…" />
      </form>

      {start && !start.ok && <Result state={start} />}

      {start?.authorizeUrl && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <a
            href={start.authorizeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-medium underline"
          >
            Paso 2: identifícate en LaLiga →
          </a>
          <div className="space-y-1 text-neutral-500">
            <p>
              Al terminar, el navegador intentará abrir una dirección que
              empieza por <code>authredirect://</code> y dirá que no puede.
              <strong> Eso es lo esperado.</strong> Copia esa dirección entera
              de la barra del navegador y pégala abajo.
            </p>
            <p>
              Si la barra no te la enseña, ábrela con las herramientas de
              desarrollador (F12) en la pestaña <em>Red</em>: es la cabecera{" "}
              <code>Location</code> de la última respuesta.
            </p>
          </div>
        </div>
      )}

      {start?.authorizeUrl && (
        <form action={doneForm} className="space-y-3">
          <Field label="Secreto del despliegue" name="secret" type="password" />
          <Field
            label="URL a la que te ha redirigido"
            name="redirected"
            type="text"
            hint="También vale pegar solo el código, si lo tienes suelto."
          />
          <Button pending={finishing} idle="Paso 3: terminar" busy="Canjeando…" />
        </form>
      )}

      {done && <Result state={done} />}
    </section>
  );
}

export function PasswordLogin() {
  const [state, formAction, pending] = useActionState<LoginState | null, FormData>(
    loginAction,
    null,
  );

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <header>
        <h2 className="font-medium">Cuenta de email y contraseña</h2>
        <p className="text-sm text-neutral-500">
          Más directo, pero solo funciona si creaste la cuenta con email. Con
          Google, Apple o Facebook devuelve <code>AADB2C90225</code>.
        </p>
      </header>

      <form action={formAction} className="space-y-3">
        <Field label="Secreto del despliegue" name="secret" type="password" />
        <Field
          label="Email de LaLiga Fantasy"
          name="email"
          type="email"
          autoComplete="username"
        />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          hint="No se guarda en ninguna parte."
        />
        <Button pending={pending} idle="Iniciar sesión" busy="Iniciando sesión…" />
      </form>

      {state && <Result state={state} />}
    </section>
  );
}

function Result({ state }: { state: LoginState }) {
  return (
    <pre
      className={`overflow-x-auto whitespace-pre-wrap rounded-lg border p-3 text-sm ${
        state.ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      }`}
    >
      {state.message}
    </pre>
  );
}

function Button({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
    >
      {pending ? busy : idle}
    </button>
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
