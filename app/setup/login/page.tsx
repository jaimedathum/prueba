import type { Metadata } from "next";
import { LoginForm } from "./login-form";

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

      <LoginForm />

      <section className="space-y-2 text-sm text-neutral-500">
        <p>
          Tu contraseña <strong>no se guarda</strong> ni aquí ni en las
          variables de entorno. Lo único que queda almacenado es el refresh
          token, cifrado con <code>TOKEN_ENCRYPTION_KEY</code>.
        </p>
        <p>
          Si tu cuenta del juego es de Google, Apple o Facebook, esto fallará:
          el login por contraseña solo sirve para cuentas locales. Está
          explicado en <code>docs/reglas.md</code>.
        </p>
      </section>
    </main>
  );
}
