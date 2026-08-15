import type { Metadata } from "next";
import Link from "next/link";
import { checkSetupEnv } from "@/lib/setup-status";
import { Notice, Page } from "../../ui";
import { InteractiveLogin, PasswordLogin } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login inicial",
  robots: { index: false, follow: false },
};

/**
 * Login inicial sin terminal.
 *
 * El flujo de referencia sigue siendo `npm run sync -- --login`, pero exige
 * tener el repositorio clonado. Esta página hace lo mismo desde el navegador,
 * que es lo único que hace falta cuando el proyecto se opera desde Vercel y
 * GitHub.
 */
export default function LoginPage() {
  return (
    <div className="max-w-2xl">
      <Page
        eyebrow="Puesta en marcha · paso 2 de 3"
        title="Login inicial"
        subtitle={
          <>
            Se hace una sola vez. Al terminar queda{" "}
            <Link href="/setup" className="font-medium text-brand-ink underline">
              traer los primeros datos
            </Link>
            : con la sesión iniciada la base sigue vacía hasta que se sincroniza.
          </>
        }
      >
        <EnvPanel />
        <InteractiveLogin />
        <PasswordLogin />

        <footer className="space-y-2 border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
          <p>
            Tus credenciales <strong>no se guardan</strong> ni aquí ni en las
            variables de entorno. Lo único que queda almacenado es el refresh
            token, cifrado con <code>TOKEN_ENCRYPTION_KEY</code>.
          </p>
          <p>
            El paso manual de copiar la URL de vuelta existe porque la dirección
            de retorno registrada en LaLiga es la de su app móvil, y no está en
            nuestra mano registrar otra. Está explicado en{" "}
            <code>docs/reglas.md</code>.
          </p>
        </footer>
      </Page>
    </div>
  );
}

/**
 * Qué ve el servidor que atiende esta petición.
 *
 * "La tengo configurada en Vercel" y "el proceso la ve" no son lo mismo: una
 * variable añadida después del último build, o marcada solo para Production
 * mientras se navega por la URL de preview, falla igual que si no existiera.
 * Esto lo convierte en un dato en vez de una conjetura.
 */
function EnvPanel() {
  const checks = checkSetupEnv();
  const faltan = checks.filter((check) => !check.ok);

  if (faltan.length === 0) {
    return (
      <Notice tone="good" title="Configuración correcta">
        El servidor ve las tres variables que hacen falta.
      </Notice>
    );
  }

  return (
    <Notice tone="warn" title="Falta configuración">
      <p>El login va a fallar hasta que se arregle.</p>

      <ul className="my-2.5 space-y-1">
        {checks.map((check) => (
          <li key={check.name} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-[3px] shrink-0"
              style={{
                color: check.ok ? "var(--color-good)" : "var(--color-bad)",
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

      <p>
        Si juras que están puestas, casi siempre es una de estas dos:{" "}
        <strong>se añadieron después del último despliegue</strong> —las
        variables solo entran en builds nuevos, hay que redesplegar—, o{" "}
        <strong>no están marcadas para este entorno</strong>: una variable solo
        de Production no existe en la URL de preview.
      </p>
    </Notice>
  );
}
