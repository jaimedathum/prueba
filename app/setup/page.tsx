import type { Metadata } from "next";
import Link from "next/link";
import { checkSetupEnv } from "@/lib/setup-status";
import { Badge, Notice, Page, Panel } from "../ui";
import { DiagnoseForm, SyncForm } from "./sync-form";

export const dynamic = "force-dynamic";
/** La sincronización va en serie y con pausas: necesita margen. */
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Puesta en marcha",
  robots: { index: false, follow: false },
};

/**
 * Centro de mando de la puesta en marcha, para operar sin terminal.
 *
 * Reúne las tres cosas que hay que hacer una vez —comprobar la configuración,
 * iniciar sesión y traer los primeros datos— porque hacerlas por separado y a
 * ciegas es de donde salen la mayoría de los atascos.
 *
 * Se presenta como tres pasos numerados y no como tres cajas sueltas: el
 * orden importa, y verlo dicho evita el error clásico de intentar sincronizar
 * antes de haber iniciado sesión.
 */
export default function SetupPage() {
  const checks = checkSetupEnv();
  const faltan = checks.filter((check) => !check.ok);

  return (
    <div className="mx-auto max-w-2xl">
      <Page
        eyebrow="Sistema"
        title="Puesta en marcha"
        subtitle="Tres pasos, una sola vez. Después esto se mantiene solo con el cron diario."
      >
        <Step
          number={1}
          title="Configuración"
          status={faltan.length === 0 ? "listo" : "falta"}
        >
          <ul className="space-y-1.5">
            {checks.map((check) => (
              <li key={check.name} className="flex items-start gap-2.5 text-[13px]">
                <span
                  aria-hidden
                  className="mt-[3px] shrink-0"
                  style={{
                    color: check.ok
                      ? "var(--color-good)"
                      : "var(--color-bad)",
                  }}
                >
                  {check.ok ? "✓" : "✕"}
                </span>
                <span className="min-w-0">
                  <code>{check.name}</code>{" "}
                  <span className="text-muted">— {check.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          {faltan.length > 0 && (
            <Notice tone="warn" title="Si juras que están puestas">
              Casi siempre es una de dos:{" "}
              <strong>se añadieron después del último despliegue</strong> —las
              variables solo entran en builds nuevos, hay que redesplegar—, o{" "}
              <strong>no están marcadas para este entorno</strong>: una variable
              solo de Production no existe en la URL de preview.
            </Notice>
          )}
        </Step>

        <Step number={2} title="Sesión">
          <p className="text-[13px] leading-relaxed text-muted">
            Guarda el refresh token cifrado. Con cuenta de Google, Apple o
            Facebook hay que usar el login interactivo.
          </p>
          <Link
            href="/setup/login"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-ink"
          >
            Ir al login
            <span aria-hidden>→</span>
          </Link>
        </Step>

        <Step number={3} title="Datos">
          <SyncForm />
        </Step>

        <DiagnoseForm />

        <p className="border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
          La sincronización solo <strong>lee</strong>. No hay ninguna ruta que
          puje, clausule ni blinde: la app recomienda y tú ejecutas en la app
          oficial.
        </p>
      </Page>
    </div>
  );
}

/**
 * Un paso del arranque. El número va fuera de la caja, en una columna
 * propia, para que se lea la secuencia antes que el contenido.
 */
function Step({
  number,
  title,
  status,
  children,
}: {
  number: number;
  title: string;
  status?: "listo" | "falta";
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3.5 sm:gap-5">
      <div
        aria-hidden
        className="scoreline hidden w-8 shrink-0 pt-3 text-right text-[26px] font-semibold leading-none text-line-strong sm:block"
      >
        {number}
      </div>
      <Panel className="min-w-0 flex-1 space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            <span className="mr-1.5 text-faint sm:hidden">{number}.</span>
            {title}
          </h2>
          {status && (
            <Badge tone={status === "listo" ? "good" : "bad"}>
              {status === "listo" ? "correcta" : "incompleta"}
            </Badge>
          )}
        </div>
        {children}
      </Panel>
    </section>
  );
}
