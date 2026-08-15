"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Navegación.
 *
 * En escritorio es una **cabecera de periódico**: nombre arriba, regla
 * gruesa, y debajo la tira de secciones en versalitas estrechas. No hay
 * columna lateral, y no es por gusto: la pantalla de rivales tiene tablas
 * de ocho columnas, y regalarle 250px fijos a un menú que siempre dice lo
 * mismo era pagar ancho de tabla por comodidad de nadie.
 *
 * En móvil la tira baja al pie, fija, porque es donde llega el pulgar de
 * quien consulta esto de pie mientras mira la app oficial.
 *
 * Sin iconos, a propósito. Cinco destinos que se llaman Plantilla, Once,
 * Mercado, Rivales y Riesgo no ganan nada con un pictograma al lado: el
 * icono de librería es ruido, y encima es lo que hace que todas las
 * aplicaciones se parezcan entre sí.
 */

interface Destino {
  href: string;
  /** Etiqueta corta, para la tira. */
  short: string;
  /** Etiqueta larga, para el menú y los sitios con espacio. */
  label: string;
}

const SQUAD: Destino = { href: "/", short: "Plantilla", label: "Mi plantilla" };
const LINEUP: Destino = { href: "/alineacion", short: "Once", label: "Alineación" };
const MARKET: Destino = { href: "/mercado", short: "Mercado", label: "Mercado y pujas" };
const RIVALS: Destino = { href: "/rivales", short: "Rivales", label: "Rivales" };
const RISK: Destino = { href: "/riesgo", short: "Riesgo", label: "Riesgo y cláusulas" };
const OVERRIDES: Destino = {
  href: "/overrides",
  short: "Correcciones",
  label: "Correcciones manuales",
};
const SETUP: Destino = {
  href: "/setup",
  short: "Ajustes",
  label: "Puesta en marcha",
};

/** Los cinco que caben cómodos en 375px sin cortar etiquetas. */
const TABS = [SQUAD, LINEUP, MARKET, RIVALS, RISK];

/** Lo secundario: en escritorio al final de la tira, en móvil en el menú. */
const SECONDARY = [OVERRIDES, SETUP];

/* ------------------------------------------------------------------ *
 * Marca
 * ------------------------------------------------------------------ */

/**
 * El campo visto desde arriba, reducido a lo que sigue siendo
 * reconocible a 24 píxeles: línea de medio campo, círculo central y las
 * dos áreas. Cuadrado y no redondeado, como el resto del sistema.
 */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className="shrink-0"
    >
      <rect width="24" height="24" rx="2" fill="var(--color-brand)" />
      <g
        stroke="var(--color-on-brand)"
        strokeWidth="1.4"
        strokeLinecap="square"
        fill="none"
      >
        <path d="M3 12h18" />
        <circle cx="12" cy="12" r="3.6" />
        <path d="M8.5 3.5v1.8h7V3.5M8.5 20.5v-1.8h7v1.8" />
      </g>
    </svg>
  );
}

/** La cabecera del periódico: el nombre, compuesto como un rótulo. */
export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline">
      <Mark />
      <span
        className="slug text-ink"
        style={{ fontSize: "15px", letterSpacing: "0.03em" }}
      >
        Fantasy Advisor
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Tira de secciones (escritorio)
 * ------------------------------------------------------------------ */

export function SectionStrip() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-stretch lg:flex" aria-label="Secciones">
      {TABS.map((item) => (
        <StripLink
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
        />
      ))}
      <span aria-hidden className="mx-3 my-2 w-px bg-line" />
      {SECONDARY.map((item) => (
        <StripLink
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
          quiet
        />
      ))}
    </nav>
  );
}

function StripLink({
  item,
  active,
  quiet = false,
}: {
  item: Destino;
  active: boolean;
  quiet?: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="relative px-3.5 py-2.5 font-sans no-underline transition-colors first:pl-0"
      style={{
        fontStretch: "82%",
        fontSize: quiet ? "11px" : "12.5px",
        fontWeight: active ? 700 : 500,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: active
          ? "var(--color-ink)"
          : quiet
            ? "var(--color-faint)"
            : "var(--color-muted)",
      }}
    >
      {/* La bandera de la sección activa se apoya sobre la regla gruesa y
          se traza al llegar. Es una transición y no una animación de
          entrada a propósito: así también se recoge al salir, y navegar
          entre dos secciones se ve como un solo movimiento. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] origin-left transition-transform duration-300 ease-out"
        style={{
          background: "var(--color-brand)",
          transform: active ? "scaleX(1)" : "scaleX(0)",
        }}
      />
      {item.short}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Tira de secciones (móvil)
 * ------------------------------------------------------------------ */

export function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 bg-canvas lg:hidden"
      style={{
        borderColor: "var(--color-rule)",
        // La barra de gestos de iOS se come los últimos píxeles.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Secciones"
    >
      {TABS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="tap relative flex items-center justify-center px-1 text-center no-underline"
            style={{
              fontStretch: "80%",
              fontSize: "11px",
              fontWeight: active ? 700 : 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: active ? "var(--color-ink)" : "var(--color-faint)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 -top-[2px] h-[3px] origin-left transition-transform duration-300 ease-out"
              style={{
                background: "var(--color-brand)",
                transform: active ? "scaleX(1)" : "scaleX(0)",
              }}
            />
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
        className="press flex h-9 w-9 items-center justify-center border border-line-strong font-mono text-[13px] leading-none text-muted hover:text-ink"
      >
        {open ? "×" : "≡"}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-60 border bg-canvas p-3"
          style={{ borderColor: "var(--color-rule)" }}
        >
          <div className="lg:hidden">
            <p className="eyebrow pb-1.5">Sistema</p>
            {SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="tap flex items-center border-b border-line text-[13px] font-medium text-muted no-underline transition-colors last:border-b-0 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <p className="eyebrow pb-1.5 pt-4">Aspecto</p>
          </div>
          <p className="eyebrow hidden pb-1.5 lg:block">Aspecto</p>
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
  { value: "light", label: "Papel" },
  { value: "dark", label: "Tinta" },
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
          className="tap flex w-full items-center gap-2.5 border-b border-line text-left text-[13px] font-medium transition-colors last:border-b-0 hover:text-ink"
          style={{
            color:
              theme === option.value ? "var(--color-ink)" : "var(--color-muted)",
          }}
        >
          <span
            aria-hidden
            className="h-2 w-2 shrink-0"
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
