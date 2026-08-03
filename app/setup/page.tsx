import type { Metadata } from "next";
import Link from "next/link";
import { checkSetupEnv } from "@/lib/setup-status";
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
 */
export default function SetupPage() {
  const checks = checkSetupEnv();
  const faltan = checks.filter((check) => !check.ok);

  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Puesta en marcha</h1>
        <p className="text-sm text-neutral-500">
          Tres pasos, una sola vez. Después esto se mantiene solo.
        </p>
      </header>

      <section className="space-y-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="font-medium">1. Configuración</h2>
        <ul className="space-y-1 text-sm">
          {checks.map((check) => (
            <li key={check.name}>
              {check.ok ? "✓" : "✗"} <code>{check.name}</code> — {check.detail}
            </li>
          ))}
        </ul>
        {faltan.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Si juras que están puestas, casi siempre es que{" "}
            <strong>se añadieron después del último despliegue</strong> —hay que
            redesplegar— o que <strong>no están marcadas para este entorno</strong>:
            una variable solo de Production no existe en la URL de preview.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="font-medium">2. Sesión</h2>
        <p className="text-sm text-neutral-500">
          Guarda el refresh token cifrado. Con cuenta de Google, Apple o
          Facebook hay que usar el login interactivo.
        </p>
        <Link href="/setup/login" className="text-sm underline">
          Ir al login →
        </Link>
      </section>

      <div className="space-y-2">
        <h2 className="sr-only">3. Datos</h2>
        <SyncForm />
      </div>

      <DiagnoseForm />

      <p className="text-sm text-neutral-500">
        La sincronización solo <strong>lee</strong>. No hay ninguna ruta que
        puje, clausule ni blinde: la app recomienda y tú ejecutas en la app
        oficial.
      </p>
    </main>
  );
}
