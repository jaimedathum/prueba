import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileTabs, OverflowMenu, SectionStrip, Wordmark } from "./nav";
import { SupportBand } from "./support";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = {
  title: {
    default: "Fantasy Advisor",
    template: "%s · Fantasy Advisor",
  },
  description: "Asistente de decisión para LaLiga Fantasy Oficial",
};

/**
 * El `SyncButton` de la cabecera vive en el layout, así que su server action
 * corre bajo el presupuesto de tiempo de este segmento. Una sincronización son
 * 250-300 peticiones serializadas a 350 ms: entre dos y cinco minutos. Con el
 * valor por defecto se cortaba a mitad, y encima dejaba la fila de `sync_runs`
 * colgada en "running" (ver `reconcileStaleRuns`).
 */
export const maxDuration = 300;

export const viewport: Viewport = {
  // La app se usa en el móvil mientras se mira la oficial: que no haga zoom
  // raro ni deje huecos bajo el notch.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d0c" },
  ],
};

/**
 * Aplica el tema elegido **antes** de pintar.
 *
 * Sin esto, quien tiene el sistema en claro y la app en oscuro ve un
 * fogonazo blanco en cada navegación completa. Va en línea y síncrono a
 * propósito: es la única forma de que corra antes del primer pintado.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('fa-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`;

/**
 * Estructura de la app: una cabecera de periódico y una columna de texto.
 *
 * Arriba el nombre con las acciones que se repiten, debajo la regla
 * gruesa, y apoyada en ella la tira de secciones. El contenido va a lo
 * ancho, sin columna lateral, porque lo que hay dentro son tablas y
 * campos, y el ancho es el recurso escaso de esta app.
 *
 * En móvil la tira de secciones baja al pie, al alcance del pulgar.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Las dos fuentes se sirven de este mismo dominio: se precargan las
            que se usan en el primer pintado y nada más. */}
        <link
          rel="preload"
          href="/fonts/archivo-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/plexmono-500-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="sticky top-0 z-30 border-b border-line bg-canvas">
          <div className="mx-auto max-w-[1180px] px-4 lg:px-8">
            <div className="flex items-center gap-4 py-3">
              <Wordmark />
              <div className="ml-auto flex items-center gap-2">
                <SyncButton />
                <OverflowMenu />
              </div>
            </div>
            <div className="rule-heavy">
              <SectionStrip />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1180px] px-4 py-7 lg:px-8 lg:py-10">
          {children}
        </div>

        {/* El colofón: quién paga esto y el hueco del anuncio. Va al final,
            fuera del contenido, y el relleno de abajo deja sitio a la tira
            fija del móvil. */}
        <div className="pb-28 lg:pb-14">
          <SupportBand />
        </div>

        <MobileTabs />
      </body>
    </html>
  );
}
