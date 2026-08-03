import type { Metadata } from "next";
import { checkSetupEnv } from "@/lib/setup-status";
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
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Login inicial</h1>
        <p className="text-sm text-neutral-500">
          Se hace una sola vez. Después el despliegue refresca la sesión solo.
        </p>
      </header>

      <EnvPanel />
      <InteractiveLogin />
      <PasswordLogin />

      <section className="space-y-2 text-sm text-neutral-500">
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
      </section>
    </main>
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
      <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        Configuración correcta: el servidor ve las tres variables que hacen
        falta.
      </p>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">
        Falta configuración. El login va a fallar hasta que se arregle.
      </p>

      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.name}>
            {check.ok ? "✓" : "✗"} <code>{check.name}</code> — {check.detail}
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
    </section>
  );
}
