"use client";

import { useActionState } from "react";
import {
  Button,
  ButtonLink,
  Field,
  Input,
  Output,
} from "../../ui";
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
 *
 * El flujo interactivo se enseña como tres pasos que van apareciendo: el
 * segundo formulario no existe hasta que hay enlace que seguir, para que no
 * se pueda intentar pegar el código antes de tenerlo.
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
    <section className="rule-heavy space-y-4 pt-3">
      <Cabecera
        title="Cuenta de Google, Apple o Facebook"
        hint="También sirve para cuentas de email y contraseña. Si no sabes cuál tienes, empieza por aquí."
      />

      <form action={startForm} className="space-y-4">
        <Field label="Secreto del despliegue">
          <Input name="secret" type="password" required />
        </Field>
        <Button type="submit" variant="primary" disabled={starting}>
          {starting ? "Generando…" : "Paso 1: generar enlace"}
        </Button>
      </form>

      {start && !start.ok && <Output tone="bad">{start.message}</Output>}

      {start?.authorizeUrl && (
        <div className="space-y-3 border border-line bg-raised p-3.5">
          <ButtonLink
            href={start.authorizeUrl}
            target="_blank"
            rel="noreferrer"
            variant="primary"
          >
            Paso 2: identifícate en LaLiga →
          </ButtonLink>
          <div className="space-y-2 text-[12px] leading-relaxed text-muted">
            <p>
              Al terminar, el navegador intentará abrir una dirección que
              empieza por <code>authredirect://</code> y dirá que no puede.
              <strong className="text-ink"> Eso es lo esperado.</strong> Copia
              esa dirección entera de la barra del navegador y pégala abajo.
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
        <form action={doneForm} className="space-y-4">
          <Field label="Secreto del despliegue">
            <Input name="secret" type="password" required />
          </Field>
          <Field
            label="URL a la que te ha redirigido"
            hint="También vale pegar solo el código, si lo tienes suelto."
          >
            <Input name="redirected" type="text" required />
          </Field>
          <Button type="submit" variant="primary" disabled={finishing}>
            {finishing ? "Canjeando…" : "Paso 3: terminar"}
          </Button>
        </form>
      )}

      {done && <Output tone={done.ok ? "good" : "bad"}>{done.message}</Output>}
    </section>
  );
}

export function PasswordLogin() {
  const [state, formAction, pending] = useActionState<LoginState | null, FormData>(
    loginAction,
    null,
  );

  return (
    <section className="rule-heavy space-y-4 pt-3">
      <Cabecera
        title="Cuenta de email y contraseña"
        hint={
          <>
            Más directo, pero solo funciona si creaste la cuenta con email. Con
            Google, Apple o Facebook devuelve <code>AADB2C90225</code>.
          </>
        }
      />

      <form action={formAction} className="space-y-4">
        <Field label="Secreto del despliegue">
          <Input name="secret" type="password" required />
        </Field>
        <Field label="Email de LaLiga Fantasy">
          <Input name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label="Contraseña" hint="No se guarda en ninguna parte.">
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Iniciando sesión…" : "Iniciar sesión"}
        </Button>
      </form>

      {state && (
        <Output tone={state.ok ? "good" : "bad"}>{state.message}</Output>
      )}
    </section>
  );
}

function Cabecera({
  title,
  hint,
}: {
  title: string;
  hint: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h2 className="slug text-ink">{title}</h2>
      <p className="text-[13px] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}
