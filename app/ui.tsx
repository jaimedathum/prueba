import type { ComponentProps, ReactNode } from "react";

/**
 * Sistema de interfaz.
 *
 * Todas las pantallas se construyen con estas piezas y ninguna inventa las
 * suyas: es lo que hace que siete páginas escritas en momentos distintos
 * parezcan el mismo producto. Si algo hay que cambiar de aspecto, se cambia
 * aquí y cambia en todas partes.
 *
 * Tres reglas que se repiten en todo el fichero:
 *
 * 1. **Móvil primero.** El layout base es de una columna y los `sm:`/`lg:`
 *    son la excepción.
 * 2. **La cifra manda.** El dato va en el peso y el tamaño más fuertes de su
 *    bloque; la etiqueta que lo nombra, en mono pequeño y apagado.
 * 3. **Lo incierto se ve incierto.** Nada que sea una estimación se pinta
 *    igual que algo medido.
 */

/* ------------------------------------------------------------------ *
 * Tonos
 * ------------------------------------------------------------------ */

export type Tone = "good" | "warn" | "bad" | "muted" | "brand";

const TONE_VAR: Record<Tone, string> = {
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  muted: "var(--color-muted)",
  brand: "var(--color-brand-ink)",
};

export function toneColor(tone: Tone): string {
  return TONE_VAR[tone];
}

/** Un fondo teñido del mismo color, lo bastante flojo para leer encima. */
function toneWash(tone: Tone, percent = 12): string {
  return `color-mix(in oklab, ${TONE_VAR[tone]} ${percent}%, transparent)`;
}

/* ------------------------------------------------------------------ *
 * Estructura
 * ------------------------------------------------------------------ */

export function Page({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  /** Dónde está el usuario, en una palabra. Sale encima del título. */
  eyebrow?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** Acciones propias de la pantalla, alineadas con el título. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="space-y-8 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px] sm:leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </main>
  );
}

export function Section({
  title,
  hint,
  aside,
  children,
}: {
  title: ReactNode;
  /** Una línea que explica para qué sirve la sección. Vale más que el título. */
  hint?: ReactNode;
  /** Contenido a la derecha del título: un contador, un enlace, un filtro. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="tick text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {aside && <div className="eyebrow shrink-0">{aside}</div>}
        {hint && (
          <p className="w-full text-[13px] leading-relaxed text-muted">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * La caja base. Sin sombra: el relieve lo dan el cambio de superficie y la
 * línea de un píxel, que aguantan igual de bien en claro y en oscuro. Una
 * sombra sobre fondo negro no se ve, y sobre papel ensucia.
 */
export function Panel({
  children,
  className = "",
  tone,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Tiñe borde y fondo. Para lo que hay que mirar antes que el resto. */
  tone?: Tone;
  as?: "div" | "li" | "article" | "section";
}) {
  return (
    <Tag
      className={`rounded-panel border p-4 ${className}`}
      style={{
        background: tone ? toneWash(tone, 10) : "var(--color-surface)",
        borderColor: tone
          ? `color-mix(in oklab, ${TONE_VAR[tone]} 55%, var(--color-line))`
          : "var(--color-line)",
      }}
    >
      {children}
    </Tag>
  );
}

/** Fila de una lista de datos: hilo de un píxel, sin caja. */
export function Row({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={`flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0 ${className}`}
    >
      {children}
    </li>
  );
}

/**
 * Lo que se enseña cuando no hay nada que enseñar. Siempre con el motivo:
 * una pantalla vacía sin explicación se lee como una avería.
 */
export function Empty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-panel border border-dashed border-line-strong px-4 py-8 text-center">
      <p className="mx-auto max-w-md text-[13px] leading-relaxed text-muted">
        {children}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cifras
 * ------------------------------------------------------------------ */

/** Una cifra grande con su etiqueta. Para lo que se mira de un vistazo. */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="eyebrow truncate" title={label}>
        {label}
      </div>
      <div
        className="scoreline truncate text-[22px] font-semibold leading-none sm:text-2xl"
        style={{ color: tone ? TONE_VAR[tone] : "var(--color-ink)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] leading-snug text-faint">{hint}</div>
      )}
    </div>
  );
}

/**
 * Rejilla de cifras. Dos columnas en móvil, cuatro a partir de tablet, con
 * un hilo vertical entre ellas: agrupa sin necesidad de cuatro cajas.
 */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-line sm:[&>*]:pl-4 sm:[&>*:first-child]:pl-0">
      {children}
    </div>
  );
}

/** Cifra en línea de texto: mono, tabular, para que no baile. */
export function Figure({
  children,
  tone,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`nums font-mono text-[0.92em] font-medium ${className}`}
      style={tone ? { color: TONE_VAR[tone] } : undefined}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Señales
 * ------------------------------------------------------------------ */

export function Badge({
  children,
  tone = "muted",
  solid = false,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Relleno lleno para lo que hay que ver desde el otro lado de la mesa. */
  solid?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-[1.5] tracking-[0.08em]"
      style={
        solid
          ? { background: TONE_VAR[tone], color: "var(--color-canvas)" }
          : {
              background: toneWash(tone, 14),
              color: TONE_VAR[tone],
            }
      }
    >
      {children}
    </span>
  );
}

/**
 * Aviso. Se usa para lo que el usuario tiene que saber antes de decidir, no
 * para adornar: si sale demasiado, deja de leerse.
 */
export function Notice({
  tone = "warn",
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-panel border-l-2 py-3 pl-4 pr-4 text-[13px] leading-relaxed text-ink"
      style={{
        background: toneWash(tone, 8),
        borderColor: TONE_VAR[tone],
      }}
    >
      {title && (
        <p
          className="eyebrow mb-1.5"
          style={{ color: TONE_VAR[tone] }}
        >
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * Escala de riesgo de 1 a 6.
 *
 * Barra en vez de números sueltos porque lo que importa es comparar de un
 * vistazo, no leer la cifra. Cuando el dato no es de fiar se atenúa y se
 * dice: un riesgo bajo sin datos suficientes no vale lo mismo que uno
 * medido.
 */
export function RiskBar({
  label,
  score,
  caption,
  confident = true,
}: {
  label: string;
  score: number;
  caption?: string;
  confident?: boolean;
}) {
  const tone: Tone = score <= 2 ? "good" : score <= 4 ? "warn" : "bad";

  return (
    <div className={confident ? "" : "opacity-55"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span
          className="nums font-mono text-[11px] font-medium"
          style={{ color: TONE_VAR[tone] }}
        >
          {score}/6 {caption}
        </span>
      </div>
      <div
        className="mt-1.5 flex gap-[3px]"
        role="img"
        aria-label={`${label}: ${score} de 6`}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-[1px]"
            style={{
              background:
                i <= score ? TONE_VAR[tone] : "var(--color-line-strong)",
              opacity: i <= score ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      {!confident && (
        <p className="mt-1.5 text-[11px] leading-snug text-faint">
          Sin datos suficientes para fiarse de este número todavía.
        </p>
      )}
    </div>
  );
}

/**
 * Banda de incertidumbre.
 *
 * Es la pieza más característica de la app, porque es su tesis: la caja de
 * un rival no es una cifra, es un intervalo, y una banda ancha significa
 * que se sabe poco, no que haya mucho dinero. Pintarlo como número suelto
 * sería mentir con precisión falsa.
 *
 * El extremo izquierdo —lo que un rival puede pagar **con seguridad**— se
 * marca aparte porque es el único número accionable para defenderse.
 */
export function RangeBar({
  min,
  point,
  max,
  scaleMax,
  format,
}: {
  min: number;
  point: number;
  max: number;
  /** Techo común a todas las barras, para que se puedan comparar entre sí. */
  scaleMax: number;
  format: (value: number) => string;
}) {
  const safe = Math.max(scaleMax, max, 1);
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / safe) * 100))}%`;
  const width = `${Math.min(100, Math.max(0.8, ((max - min) / safe) * 100))}%`;

  return (
    <div
      className="relative h-5 w-full min-w-28"
      role="img"
      aria-label={`Entre ${format(min)} y ${format(max)}, estimado ${format(point)}`}
    >
      {/* Carril */}
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      {/* Banda */}
      <span
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-[2px]"
        style={{ left: pct(min), width, background: "var(--color-band)" }}
      />
      {/* Mínimo garantizado */}
      <span
        className="absolute top-1/2 h-4 w-px -translate-y-1/2"
        style={{ left: pct(min), background: "var(--color-line-strong)" }}
      />
      {/* Estimación */}
      <span
        className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-[1px]"
        style={{ left: pct(point), background: "var(--color-brand-ink)" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Controles
 * ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "press tap inline-flex items-center justify-center gap-2 rounded-control border px-3.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50";

function buttonStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return {
        background: "var(--color-brand)",
        borderColor: "var(--color-brand)",
        color: "var(--color-on-brand)",
      };
    case "secondary":
      return {
        background: "var(--color-surface)",
        borderColor: "var(--color-line-strong)",
        color: "var(--color-ink)",
      };
    case "danger":
      return {
        background: "transparent",
        borderColor: "color-mix(in oklab, var(--color-bad) 40%, transparent)",
        color: "var(--color-bad)",
      };
    default:
      return {
        background: "transparent",
        borderColor: "transparent",
        color: "var(--color-muted)",
      };
  }
}

export function Button({
  variant = "secondary",
  className = "",
  style,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} ${className}`}
      style={{ ...buttonStyle(variant), ...style }}
    />
  );
}

/** Enlace con aspecto de botón. Mismo peso visual, semántica de navegación. */
export function ButtonLink({
  variant = "secondary",
  className = "",
  style,
  ...props
}: ComponentProps<"a"> & { variant?: ButtonVariant }) {
  return (
    <a
      {...props}
      className={`${BUTTON_BASE} no-underline ${className}`}
      style={{ ...buttonStyle(variant), ...style }}
    />
  );
}

/** Campo de formulario con etiqueta, pista y espacio táctil suficiente. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && (
        <span className="block text-[11px] leading-snug text-faint">{hint}</span>
      )}
    </label>
  );
}

const CONTROL =
  "w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${className}`} />;
}

/** Casilla con su explicación debajo, que es donde se lee de verdad. */
export function Checkbox({
  label,
  hint,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-[13px]">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-ink)]"
      />
      <span className="min-w-0">
        <span className="block font-medium text-ink">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[11px] leading-snug text-faint">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Desplegable. Se usa mucho en esta app porque casi toda recomendación
 * lleva detrás el detalle que la sostiene, y esconderlo no es ocultarlo:
 * está a un clic y con el número de cosas que hay dentro escrito fuera.
 */
export function Disclosure({
  summary,
  children,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="tap -mx-1 flex items-center gap-2 rounded px-1 text-[13px] font-medium text-muted transition-colors hover:text-ink">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-90"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Tablas
 * ------------------------------------------------------------------ */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`eyebrow whitespace-nowrap border-b border-line-strong pb-2 pr-3 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  numeric = false,
  className = "",
  ...props
}: ComponentProps<"td"> & { align?: "left" | "right"; numeric?: boolean }) {
  return (
    <td
      {...props}
      className={`border-b border-line py-2.5 pr-3 align-middle ${
        align === "right" ? "text-right" : "text-left"
      } ${numeric ? "nums font-mono" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ *
 * Estados de carga y salidas técnicas
 * ------------------------------------------------------------------ */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/**
 * Salida en crudo de una herramienta: trazas, informes de mapeo, mensajes
 * del servidor. Se respeta el texto tal cual llega, con su color según
 * haya ido bien o mal, porque reescribirlo sería perder el dato.
 */
export function Output({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <pre
      className="overflow-x-auto whitespace-pre-wrap rounded-control border-l-2 px-3 py-2.5 font-mono text-[12px] leading-relaxed"
      style={{
        background: toneWash(tone, 8),
        borderColor: TONE_VAR[tone],
        color: "var(--color-ink)",
      }}
    >
      {children}
    </pre>
  );
}
