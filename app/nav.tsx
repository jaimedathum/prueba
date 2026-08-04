"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegación.
 *
 * En móvil va **abajo**, fija, con iconos: es donde llega el pulgar y donde
 * la espera cualquiera que use el móvil de pie o con una mano. Cinco destinos
 * caben justos, así que las etiquetas son cortas y el área táctil llega a los
 * 44px aunque el texto sea pequeño.
 *
 * A partir de tablet pasa arriba en horizontal, donde sobra sitio y una barra
 * inferior fija solo estorbaría.
 */

/**
 * Cinco destinos en la barra inferior: es lo que cabe cómodo en 375px sin
 * que las etiquetas se corten. Los que no entran no desaparecen, van en la
 * de escritorio y enlazados desde donde hacen falta.
 */
const LINKS = [
  { href: "/", label: "Plantilla", icon: SquadIcon },
  { href: "/alineacion", label: "Once", icon: PitchIcon },
  { href: "/mercado", label: "Mercado", icon: MarketIcon },
  { href: "/rivales", label: "Rivales", icon: RivalsIcon },
  { href: "/riesgo", label: "Riesgo", icon: RiskIcon },
] as const;

/** En escritorio sobra sitio, así que caben también los secundarios. */
const EXTRA = [
  { href: "/overrides", label: "Correcciones" },
  { href: "/setup", label: "Puesta en marcha" },
] as const;

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {[...LINKS, ...EXTRA].map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              background: active ? "var(--surface-2)" : "transparent",
              color: active ? "var(--text)" : "var(--muted)",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t sm:hidden"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        // La barra de gestos de iOS se come los últimos píxeles.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="tap flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium"
            style={{ color: active ? "var(--accent)" : "var(--muted)" }}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** La raíz solo está activa en exacto; el resto, también en sus subrutas. */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/* ------------------------------------------------------------------ *
 * Iconos. En línea y monocromos: heredan el color del enlace activo y no
 * añaden ni una petición de red.
 * ------------------------------------------------------------------ */

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function SquadIcon() {
  return (
    <svg {...svg}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
}

function PitchIcon() {
  return (
    <svg {...svg}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M12 4v16" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MarketIcon() {
  return (
    <svg {...svg}>
      <path d="M3 6h18l-1.5 12a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2Z" />
      <path d="M8 6V4a4 4 0 0 1 8 0v2" />
    </svg>
  );
}

function RiskIcon() {
  return (
    <svg {...svg}>
      <path d="M12 3 2 20h20Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function RivalsIcon() {
  return (
    <svg {...svg}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="17" cy="9" r="3" />
      <path d="M2 20a6 6 0 0 1 12 0" />
      <path d="M13 20a6 6 0 0 1 9-5" />
    </svg>
  );
}
