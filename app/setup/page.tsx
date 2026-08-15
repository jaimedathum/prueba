import type { Metadata } from "next";
import Link from "next/link";
import { checkSetupEnv } from "@/lib/setup-status";
import { Badge, Notice, Page } from "../ui";
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
    <div className="max-w-2xl">
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
            <Notice title="Si juras que están puestas">
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
 * Un paso del arranque.
 *
 * El número va grande y colgando a la izquierda, fuera de la columna de
 * contenido: así la secuencia se lee antes que lo que hay dentro de cada
 * paso, que es justo el error del que salen la mitad de los atascos
 * —intentar sincronizar antes de haber iniciado sesión—.
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
    <section className="rule-heavy pt-3">
      <div className="flex items-baseline gap-4">
        <span
          aria-hidden
          className="scoreline w-9 shrink-0 text-[32px] text-line-strong"
        >
          {String(number).padStart(2, "0")}
        </span>
        <h2 className="slug flex-1 text-ink">{title}</h2>
        {status && (
          <Badge tone={status === "listo" ? "good" : "bad"}>
            {status === "listo" ? "correcta" : "incompleta"}
          </Badge>
        )}
      </div>
      <div className="mt-4 space-y-4 sm:pl-[3.25rem]">{children}</div>
    </section>
  );
}
