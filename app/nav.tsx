"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Navegación.
 *
 * Dos formas para dos maneras de usar la app, no una redimensionada:
 *
 * - **En móvil**, barra abajo con los cinco destinos que se consultan en
 *   caliente, mientras se mira la app oficial. Va abajo porque es donde
 *   llega el pulgar, y el área táctil llega a 44px aunque el texto sea de
 *   diez píxeles.
 * - **En escritorio**, una columna fija a la izquierda con los destinos
 *   agrupados por la pregunta que responden. Con sitio de sobra, agrupar
 *   enseña de qué va el producto; una fila de siete enlaces sueltos, no.
 *
 * Lo que no entra en la barra de móvil no desaparece: vive en el menú de
 * la cabecera.
 */

interface Destino {
  href: string;
  /** Etiqueta corta, para la barra de móvil. */
  short: string;
  /** Etiqueta larga, para la columna de escritorio. */
  label: string;
  icon: () => React.ReactElement;
}

const SQUAD: Destino = {
  href: "/",
  short: "Plantilla",
  label: "Mi plantilla",
  icon: SquadIcon,
};
const LINEUP: Destino = {
  href: "/alineacion",
  short: "Once",
  label: "Alineación",
  icon: PitchIcon,
};
const MARKET: Destino = {
  href: "/mercado",
  short: "Mercado",
  label: "Mercado y pujas",
  icon: MarketIcon,
};
const RISK: Destino = {
  href: "/riesgo",
  short: "Riesgo",
  label: "Riesgo y cláusulas",
  icon: RiskIcon,
};
const RIVALS: Destino = {
  href: "/rivales",
  short: "Rivales",
  label: "Rivales",
  icon: RivalsIcon,
};
const OVERRIDES: Destino = {
  href: "/overrides",
  short: "Correcciones",
  label: "Correcciones",
  icon: TuneIcon,
};
const SETUP: Destino = {
  href: "/setup",
  short: "Ajustes",
  label: "Puesta en marcha",
  icon: SetupIcon,
};

/** Los cinco que caben cómodos en 375px sin cortar etiquetas. */
const TABS = [SQUAD, LINEUP, MARKET, RIVALS, RISK];

/** Agrupados por la pregunta que contestan, no por orden de construcción. */
const GROUPS: { title: string; items: Destino[] }[] = [
  { title: "Mi equipo", items: [SQUAD, LINEUP] },
  { title: "Decidir", items: [MARKET, RISK] },
  { title: "La liga", items: [RIVALS] },
  { title: "Sistema", items: [OVERRIDES, SETUP] },
];

/** Lo que no cabe en la barra de móvil. */
const OVERFLOW = [OVERRIDES, SETUP];

/* ------------------------------------------------------------------ *
 * Marca
 * ------------------------------------------------------------------ */

/**
 * El campo visto desde arriba, reducido a lo que sigue siendo reconocible
 * a 24 píxeles: línea de medio campo, círculo central y las dos áreas.
 */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className="shrink-0"
    >
      <rect width="24" height="24" rx="7" fill="var(--color-brand)" />
      <g
        stroke="var(--color-on-brand)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M3.5 12h17" />
        <circle cx="12" cy="12" r="3.6" />
        <path d="M8.5 4.2v1.6h7V4.2M8.5 19.8v-1.6h7v1.6" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline">
      <Mark />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          Fantasy Advisor
        </span>
        <span className="eyebrow block leading-tight">Liga privada</span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Columna de escritorio
 * ------------------------------------------------------------------ */

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
      <div className="px-5 py-5">
        <Wordmark />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="eyebrow px-2 pb-1">{group.title}</p>
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
              />
            ))}
          </div>
        ))}
      </nav>

      <p className="border-t border-line px-5 py-4 text-[11px] leading-relaxed text-faint">
        El motor calcula, la IA explica.
        <br />
        Nunca al revés.
      </p>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: Destino; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="relative flex items-center gap-2.5 rounded-control px-2 py-2 text-[13px] font-medium no-underline transition-colors"
      style={{
        background: active ? "var(--color-raised)" : "transparent",
        color: active ? "var(--color-ink)" : "var(--color-muted)",
      }}
    >
      {/* El indicador de posición es una marca de marca, no un subrayado. */}
      <span
        aria-hidden
        className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r"
        style={{ background: active ? "var(--color-brand)" : "transparent" }}
      />
      <span style={{ color: active ? "var(--color-brand-ink)" : "inherit" }}>
        <Icon />
      </span>
      {item.label}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Barra de móvil
 * ------------------------------------------------------------------ */

export function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface lg:hidden"
      style={{
        // La barra de gestos de iOS se come los últimos píxeles.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="tap relative flex flex-col items-center justify-center gap-1 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.06em] no-underline"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-faint)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-4 top-0 h-[2px] rounded-b"
              style={{ background: active ? "var(--color-brand)" : "transparent" }}
            />
            <span
              style={{ color: active ? "var(--color-brand-ink)" : "inherit" }}
            >
              <Icon />
            </span>
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * Menú de la cabecera
 * ------------------------------------------------------------------ */

/** Da acceso en móvil a lo que no cabe abajo, y al tema en cualquier tamaño. */
export function OverflowMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al pulsar fuera o con Escape: un menú que solo se cierra con su
  // propio botón se queda abierto por encima del contenido.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Más opciones"
        className="press flex h-9 w-9 items-center justify-center rounded-control border border-line text-muted hover:text-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-panel border border-line bg-surface p-1.5 shadow-lg"
        >
          <p className="eyebrow px-2 py-1.5 lg:hidden">Sistema</p>
          {OVERFLOW.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="tap flex items-center gap-2.5 rounded-control px-2 text-[13px] font-medium text-muted no-underline transition-colors hover:bg-raised hover:text-ink lg:hidden"
            >
              <item.icon />
              {item.label}
            </Link>
          ))}
          <div className="my-1.5 h-px bg-line lg:hidden" />
          <p className="eyebrow px-2 py-1.5">Aspecto</p>
          <ThemeChoices onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tema
 * ------------------------------------------------------------------ */

type Theme = "system" | "light" | "dark";

const THEME_KEY = "fa-theme";

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "El del sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

function ThemeChoices({ onPick }: { onPick: () => void }) {
  const [theme, setTheme] = useState<Theme>("system");

  // El valor real vive en el DOM desde antes de hidratar (ver el script del
  // layout). Aquí solo se lee para marcar cuál está puesto.
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    setTheme(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  const apply = (value: Theme) => {
    setTheme(value);
    if (value === "system") {
      localStorage.removeItem(THEME_KEY);
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem(THEME_KEY, value);
      document.documentElement.dataset.theme = value;
    }
    onPick();
  };

  return (
    <div role="group" aria-label="Tema">
      {THEMES.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => apply(option.value)}
          className="tap flex w-full items-center gap-2.5 rounded-control px-2 text-left text-[13px] font-medium transition-colors hover:bg-raised"
          style={{
            color:
              theme === option.value ? "var(--color-ink)" : "var(--color-muted)",
          }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background:
                theme === option.value
                  ? "var(--color-brand)"
                  : "var(--color-line-strong)",
            }}
          />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

/** La raíz solo está activa en exacto; el resto, también en sus subrutas. */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/* ------------------------------------------------------------------ *
 * Iconos. En línea y monocromos: heredan el color del enlace activo y no
 * añaden ni una petición de red.
 * ------------------------------------------------------------------ */

const svg = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h18" />
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

function TuneIcon() {
  return (
    <svg {...svg}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}

function SetupIcon() {
  return (
    <svg {...svg}>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}
