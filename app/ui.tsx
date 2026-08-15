import type { ComponentProps, ReactNode } from "react";

/**
 * Sistema de interfaz.
 *
 * El modelo no es el panel de control con tarjetas flotando, sino la
 * **página de resultados impresa**: reglas gruesas que abren sección,
 * filetes finos que separan filas, titulares estrechos y apretados, y las
 * cifras con el peso que les corresponde por lo que valen. Casi nada
 * lleva caja; lo que separa es el filete.
 *
 * Cuatro reglas que se repiten en todo el fichero:
 *
 * 1. **Móvil primero.** El layout base es de una columna.
 * 2. **La cifra manda.** El dato va en el cuerpo más grande de su bloque
 *    y el rótulo que lo nombra, en mono diminuto. El salto entre los dos
 *    es grande a propósito: la jerarquía se ve antes de leerse.
 * 3. **El acento se raciona.** Lima solo para la sección activa, el botón
 *    principal, la cifra que contesta la pantalla y la banda de
 *    incertidumbre.
 * 4. **Lo incierto se ve incierto.** Nada estimado se pinta igual que
 *    algo medido.
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

function toneWash(tone: Tone, percent = 10): string {
  return `color-mix(in oklab, ${TONE_VAR[tone]} ${percent}%, transparent)`;
}

/* ------------------------------------------------------------------ *
 * Estructura
 * ------------------------------------------------------------------ */

export interface MetaItem {
  label: string;
  value: ReactNode;
}

/**
 * Cabecera de pantalla, compuesta como una portada: antetítulo diminuto,
 * titular grande y estrecho, y debajo de la regla gruesa la entradilla a
 * la izquierda con la ficha de datos a la derecha.
 */
export function Page({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** La ficha: dos o tres datos que sitúan la pantalla, en la cabecera. */
  meta?: MetaItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="space-y-10 pb-6">
      <header>
        {eyebrow && <p className="eyebrow mb-2.5">{eyebrow}</p>}

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <h1 className="display min-w-0 max-w-3xl text-ink">{title}</h1>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        {(subtitle || meta) && (
          <div className="rule-heavy mt-5 flex flex-col gap-5 pt-3 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
            {subtitle && (
              <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted">
                {subtitle}
              </p>
            )}
            {meta && meta.length > 0 && (
              <dl className="flex shrink-0 flex-wrap gap-x-8 gap-y-3">
                {meta.map((item) => (
                  <div key={item.label}>
                    <dt className="eyebrow">{item.label}</dt>
                    <dd className="scoreline mt-1 text-[15px] text-ink">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </header>
      {children}
    </main>
  );
}

/**
 * Sección. La regla gruesa con el cuadratín de acento en su extremo
 * izquierdo, el rótulo apoyado debajo y el contador al otro lado. Es la
 * unidad de composición de toda la app.
 */
export function Section({
  title,
  hint,
  aside,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="quad rule-heavy relative flex items-baseline justify-between gap-4 pt-3">
        <h2 className="slug text-ink">{title}</h2>
        {aside && <span className="eyebrow shrink-0">{aside}</span>}
      </div>
      {hint && (
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
          {hint}
        </p>
      )}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

/**
 * Caja. Existe para lo poco que de verdad necesita un contorno —un
 * formulario, una recomendación destacada—, no para envolver cada lista
 * de la app. Sin sombra y con esquina casi recta: aquí el papel no
 * flota.
 */
export function Panel({
  children,
  className = "",
  tone,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  as?: "div" | "li" | "article" | "section";
}) {
  return (
    <Tag
      className={`border p-4 ${className}`}
      style={{
        background: tone ? toneWash(tone, 9) : "var(--color-surface)",
        borderColor: tone
          ? `color-mix(in oklab, ${TONE_VAR[tone]} 55%, var(--color-line))`
          : "var(--color-line)",
      }}
    >
      {children}
    </Tag>
  );
}

/** Fila de una lista de datos: filete de un píxel, sin caja. */
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
    <div className="border-y border-line py-7">
      <p className="max-w-lg text-[13px] leading-relaxed text-muted">
        {children}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cifras
 * ------------------------------------------------------------------ */

/**
 * La cifra que contesta la pregunta de la pantalla, en el cuerpo que le
 * corresponde por importancia. Es la única que se puede pintar del color
 * de la marca, y solo hay una por página.
 */
export function Lede({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p
        className="scoreline mt-2 text-[clamp(2.5rem,1.6rem+3.6vw,4rem)]"
        style={{
          color: accent ? "var(--color-brand-ink)" : "var(--color-ink)",
        }}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Una cifra con su rótulo. Para lo que se compara de un vistazo. */
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
    <div className="min-w-0">
      <div className="eyebrow truncate" title={label}>
        {label}
      </div>
      <div
        className="scoreline mt-1.5 truncate text-[26px] sm:text-[28px]"
        style={{ color: tone ? TONE_VAR[tone] : "var(--color-ink)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] leading-snug text-faint">{hint}</div>
      )}
    </div>
  );
}

/**
 * La tira de cifras: filete arriba y abajo, columnas separadas por
 * hilos. Es una tira de marcador, no cuatro tarjetas.
 */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="rule grid grid-cols-2 gap-y-6 border-b border-line py-5 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-line sm:[&>*]:px-5 sm:[&>*:first-child]:pl-0 sm:[&>*:last-child]:pr-0">
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

/**
 * Distintivo. Recto y en mono, como un sello sobre el papel: nada de
 * píldoras redondeadas de colores, que en una lista de veinte convierten
 * la pantalla en un semáforo.
 */
export function Badge({
  children,
  tone = "muted",
  solid = false,
}: {
  children: ReactNode;
  tone?: Tone;
  solid?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap px-1.5 py-[3px] font-mono text-[10px] font-medium uppercase leading-none tracking-[0.1em]"
      style={
        solid
          ? { background: TONE_VAR[tone], color: "var(--color-canvas)" }
          : {
              color: TONE_VAR[tone],
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${TONE_VAR[tone]} 45%, transparent)`,
            }
      }
    >
      {children}
    </span>
  );
}

/**
 * Aviso. Se usa para lo que el usuario tiene que saber antes de decidir,
 * no para adornar: si sale demasiado, deja de leerse.
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
      className="border-l-2 py-2.5 pl-4 text-[13px] leading-relaxed text-ink"
      style={{ borderColor: TONE_VAR[tone] }}
    >
      {title && (
        <p className="eyebrow mb-1.5" style={{ color: TONE_VAR[tone] }}>
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
            className="h-1 flex-1"
            style={{
              background:
                i <= score ? TONE_VAR[tone] : "var(--color-line-strong)",
              opacity: i <= score ? 1 : 0.4,
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
 * Es la pieza más característica de la app, porque es su tesis: la caja
 * de un rival no es una cifra, es un intervalo, y una banda ancha
 * significa que se sabe poco, no que haya mucho dinero. Pintarlo como
 * número suelto sería mentir con precisión falsa.
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
  const pct = (value: number) =>
    `${Math.min(100, Math.max(0, (value / safe) * 100))}%`;
  const width = `${Math.min(100, Math.max(0.8, ((max - min) / safe) * 100))}%`;

  return (
    <div
      className="relative h-5 w-full min-w-28"
      role="img"
      aria-label={`Entre ${format(min)} y ${format(max)}, estimado ${format(point)}`}
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <span
        className="absolute top-1/2 h-2 -translate-y-1/2"
        style={{ left: pct(min), width, background: "var(--color-band)" }}
      />
      <span
        className="absolute top-1/2 h-4 w-px -translate-y-1/2"
        style={{ left: pct(min), background: "var(--color-line-strong)" }}
      />
      <span
        className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2"
        style={{ left: pct(point), background: "var(--color-ink)" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Controles
 * ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "press tap inline-flex items-center justify-center gap-2 border px-4 font-mono text-[11px] font-medium uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-50";

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
        background: "transparent",
        borderColor: "var(--color-line-strong)",
        color: "var(--color-ink)",
      };
    case "danger":
      return {
        background: "transparent",
        borderColor: "color-mix(in oklab, var(--color-bad) 45%, transparent)",
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

/** Campo de formulario con rótulo, pista y espacio táctil suficiente. */
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
    <label className={`block ${className}`}>
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[11px] leading-snug text-faint">
          {hint}
        </span>
      )}
    </label>
  );
}

/**
 * Los controles llevan solo filete inferior, como una casilla de un
 * impreso. Una caja completa alrededor de cada campo compite con las
 * reglas de la página.
 */
const CONTROL =
  "w-full border-b border-line-strong bg-transparent px-0 py-2 text-[14px] text-ink placeholder:text-faint focus:border-ink";

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
 *
 * El conmutador es un `[+]` de mono, no un galón: en una página de
 * filetes, un icono de librería canta.
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
    <details className={`group border-t border-line ${className}`}>
      <summary className="tap flex items-center gap-2.5 py-2 text-[12px] font-medium text-muted transition-colors hover:text-ink">
        <span
          aria-hidden
          className="font-mono text-[13px] leading-none text-faint"
        >
          <span className="group-open:hidden">[+]</span>
          <span className="hidden group-open:inline">[−]</span>
        </span>
        {summary}
      </summary>
      <div className="pb-4 pt-1">{children}</div>
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
      className={`eyebrow whitespace-nowrap border-b-2 pb-2 pr-3 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
      style={{ borderColor: "var(--color-rule)" }}
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
      className="overflow-x-auto whitespace-pre-wrap border-l-2 py-2.5 pl-4 font-mono text-[12px] leading-relaxed text-ink"
      style={{ borderColor: TONE_VAR[tone] }}
    >
      {children}
    </pre>
  );
}
