"use client";

import { useActionState } from "react";
import {
  Button,
  Checkbox,
  Disclosure,
  Field,
  Input,
  Notice,
  Output,
  Table,
  Td,
  Th,
} from "../ui";
import {
  diagnoseAction,
  runSyncAction,
  type DiagnosisState,
  type SyncState,
} from "./actions";

/**
 * Disparador manual de la sincronización. El resultado se enseña entero
 * —contadores, avisos e informe de mapeo— porque es justo lo que hace falta
 * para saber si la ingesta va bien o si un parser está fallando en silencio.
 *
 * Va sin caja propia: lo envuelve el paso 3 de la página de arranque.
 */
export function SyncForm() {
  const [state, formAction, pending] = useActionState<SyncState | null, FormData>(
    runSyncAction,
    null,
  );

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted">
        El cron lo hace solo cada día, pero después del primer login conviene
        lanzarlo a mano para no esperar 24 horas.
      </p>

      <form action={formAction} className="space-y-4">
        <Field label="Secreto del despliegue">
          <Input name="secret" type="password" required />
        </Field>

        <div className="space-y-3">
          <Checkbox
            name="dryRun"
            label="Solo lectura"
            hint="Lee de la API pero no escribe nada. Útil para la primera prueba."
          />
          <Checkbox
            name="shape"
            defaultChecked
            label="Informe de mapeo de campos"
            hint="Qué campos no se encontraron y cuáles llegan sin que nadie los lea. Es lo que cierra las incógnitas de docs/reglas.md."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Sincronizando…" : "Sincronizar ahora"}
          </Button>
          {pending && (
            <p className="text-[12px] leading-snug text-faint">
              Puede tardar un minuto: las peticiones van en serie y con pausa
              entre ellas, a propósito.
            </p>
          )}
        </div>
      </form>

      {state && <Result state={state} />}
    </div>
  );
}

function Result({ state }: { state: SyncState }) {
  return (
    <div className="space-y-3">
      <Output tone={state.ok ? "good" : "warn"}>{state.message}</Output>

      {state.stats && state.stats.length > 0 && (
        <ul>
          {state.stats.map(([key, value]) => (
            <li
              key={key}
              className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-b-0"
            >
              <span className="eyebrow">{key}</span>
              <span className="nums font-mono text-[13px] font-medium">
                {value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.warnings && state.warnings.length > 0 && (
        <Notice tone="warn" title={`Avisos (${state.warnings.length})`}>
          <ul className="list-disc space-y-1 pl-4 marker:text-faint">
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}

      {state.shape && (
        <Disclosure summary="Informe de mapeo de campos">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap border border-line p-3 font-mono text-[11px] leading-relaxed">
            {state.shape}
          </pre>
        </Disclosure>
      )}
    </div>
  );
}

/**
 * Diagnóstico de la API. Aparece aparte de la sincronización porque se usa
 * justo cuando esa falla: un 404 no dice si sobra o falta un prefijo en la
 * URL base o si el identificador de competición no es el que toca.
 */
export function DiagnoseForm() {
  const [state, formAction, pending] = useActionState<
    DiagnosisState | null,
    FormData
  >(diagnoseAction, null);

  return (
    <section className="rule-heavy space-y-4 pt-3">
      <div className="space-y-1.5">
        <h2 className="slug text-ink">Diagnosticar la API</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Si la sincronización falla con un 404 o un 401, esto dice dónde está
          el problema en vez de dejarte probando a ciegas.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <Field label="Secreto del despliegue">
          <Input name="secret" type="password" required />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Probando…" : "Diagnosticar"}
        </Button>
      </form>

      {state && (
        <div className="space-y-3">
          <Output tone={state.ok ? "good" : "warn"}>{state.message}</Output>

          {state.results && state.results.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Base</Th>
                  <Th>Ruta</Th>
                  <Th align="right">Estado</Th>
                </tr>
              </thead>
              <tbody>
                {state.results.map((result, index) => (
                  <tr key={`${result.base}${result.path}${index}`}>
                    <Td className="break-all font-mono text-[11px] text-faint">
                      {result.base}
                    </Td>
                    <Td className="break-all font-mono text-[11px]">
                      {result.path}
                    </Td>
                    <Td align="right" numeric>
                      {result.status ?? result.error ?? "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {state.me && (
            <Disclosure summary="Ver tu usuario, según la API">
              <p className="text-[12px] leading-relaxed text-faint">
                Aquí dentro están los identificadores de tu liga y de tu equipo,
                que son los que hay que poner en <code>FANTASY_LEAGUE_ID</code> y{" "}
                <code>FANTASY_TEAM_ID</code>.
              </p>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap border border-line p-3 font-mono text-[11px] leading-relaxed">
                {state.me}
              </pre>
            </Disclosure>
          )}
        </div>
      )}
    </section>
  );
}
