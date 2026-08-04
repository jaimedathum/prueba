import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DesktopNav, MobileNav } from "./nav";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = {
  title: "Fantasy Advisor",
  description: "Asistente de decisión para LaLiga Fantasy Oficial",
};

export const viewport: Viewport = {
  // La app se usa en el móvil mientras se mira la oficial: que no haga zoom
  // raro ni deje huecos bajo el notch.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/**
 * Estructura de la app.
 *
 * Móvil primero: cabecera fija arriba con lo único que se necesita siempre
 * —dónde estás y el botón de sincronizar— y navegación abajo, al alcance del
 * pulgar. En pantallas grandes la navegación sube a la cabecera y la barra
 * inferior desaparece.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <header
          className="sticky top-0 z-40 border-b backdrop-blur"
          style={{
            background: "color-mix(in oklab, var(--bg) 85%, transparent)",
            borderColor: "var(--border)",
          }}
        >
          <div className="relative mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <span className="text-sm font-semibold tracking-tight">
              Fantasy Advisor
            </span>
            <DesktopNav />
            <div className="ml-auto">
              <SyncButton />
            </div>
          </div>
        </header>

        {/* El padding inferior deja sitio a la barra de navegación fija. */}
        <div className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:pb-10">
          {children}
        </div>

        <MobileNav />
      </body>
    </html>
  );
}
