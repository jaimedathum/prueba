import type { Metadata } from "next";
import { auth, signIn, signOut } from "@/lib/auth";
import { configuredProviders } from "@/lib/auth-providers";
import { Button, Field, Input, Notice, Page, Section } from "../ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/**
 * Entrada a la aplicación.
 *
 * Enseña **solo** los proveedores realmente configurados, y cuando no hay
 * ninguno lo dice con lo que falta por poner. Es el mismo criterio que en
 * `/setup`: un despliegue a medio configurar tiene que poder explicarse, y no
 * hay nada más desesperante que un botón de "Entrar con Google" que devuelve
 * un error del proveedor porque nadie rellenó las claves.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const enabled = configuredProviders();
  const ninguno = !enabled.google && !enabled.email;
  const session = await auth().catch(() => null);

  // Quien ya está dentro no necesita otra vez los botones de entrar: necesita
  // poder salir, que es lo único que no tiene en ninguna otra pantalla.
  if (session?.user) {
    return (
      <div className="max-w-lg">
        <Page
          eyebrow="Cuenta"
          title="Ya has entrado"
          subtitle={session.user.email ?? undefined}
        >
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit">Cerrar sesión</Button>
          </form>
        </Page>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <Page
        eyebrow="Cuenta"
        title="Entrar"
        subtitle="Tu liga, tu plantilla y tus recomendaciones. Nadie más las ve."
      >
        {ninguno ? (
          <Notice tone="warn" title="El acceso no está configurado todavía">
            <p>
              No hay ningún proveedor de identidad activo, así que la
              aplicación sigue funcionando en modo de un solo dueño y esta
              página no hace nada todavía.
            </p>
            <p className="mt-2">
              Para encenderlo hace falta <strong>uno</strong> de los dos:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <code>AUTH_GOOGLE_ID</code> y <code>AUTH_GOOGLE_SECRET</code>
              </li>
              <li>
                <code>EMAIL_SERVER</code> y <code>EMAIL_FROM</code>, para
                enlaces de acceso por correo
              </li>
            </ul>
            <p className="mt-2">
              Y en ambos casos <code>AUTH_SECRET</code>. En cuanto una de las
              dos parejas esté puesta, el acceso se exige solo.
            </p>
          </Notice>
        ) : null}

        {enabled.google ? (
          <Section title="Con Google">
            <form
              action={async () => {
                "use server";
                const { next } = await searchParams;
                await signIn("google", { redirectTo: next ?? "/" });
              }}
            >
              <Button type="submit" variant="primary">
                Entrar con Google
              </Button>
            </form>
          </Section>
        ) : null}

        {enabled.email ? (
          <Section
            title="Con tu correo"
            hint="Te llega un enlace de un solo uso. No hay contraseña que recordar ni que nos puedan robar."
          >
            <form
              action={async (formData: FormData) => {
                "use server";
                const { next } = await searchParams;
                await signIn("nodemailer", {
                  email: String(formData.get("email") ?? ""),
                  redirectTo: next ?? "/",
                });
              }}
              className="space-y-4"
            >
              <Field label="Correo electrónico">
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="tu@correo.com"
                />
              </Field>
              <Button type="submit" variant="primary">
                Enviarme el enlace
              </Button>
            </form>
          </Section>
        ) : null}
      </Page>
    </div>
  );
}
