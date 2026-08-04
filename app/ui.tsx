import type { ReactNode } from "react";

/**
 * Piezas compartidas de la interfaz.
 *
 * Existen para que las cinco pantallas se parezcan entre sí sin repetir la
 * misma ristra de clases en cada una. Todas asumen **móvil primero**: el
 * layout base es de una columna y los `sm:` son la excepción, no al revés.
 */

/* ------------------------------------------------------------------ *
 * Estructura
 * ------------------------------------------------------------------ */

export function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {subtitle}
          </p>
        )}
      </header>
      {children}
    </main>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  /** Una línea que explica para qué sirve la sección. Vale más que el título. */
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {title}
        </h2>
        {hint && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

/** Lo que se enseña cuando no hay nada que enseñar, con el motivo. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {children}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Datos
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
    <div className="space-y-0.5">
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="nums text-lg font-semibold sm:text-xl"
        style={tone ? { color: toneColor(tone) } : undefined}
      >
        {value}
      </div>
      {hint && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/** Rejilla de cifras. Dos columnas en móvil, cuatro a partir de tablet. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{children}</div>;
}

export type Tone = "good" | "warn" | "bad" | "muted";

function toneColor(tone: Tone): string {
  return {
    good: "var(--good)",
    warn: "var(--warn)",
    bad: "var(--bad)",
    muted: "var(--muted)",
  }[tone];
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color: toneColor(tone), borderColor: "currentColor" }}
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
      className="rounded-xl border p-4 text-sm"
      style={{ borderColor: toneColor(tone), color: "var(--text)" }}
    >
      {title && (
        <p className="mb-1 font-medium" style={{ color: toneColor(tone) }}>
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
 * vistazo, no leer la cifra. Cuando el dato no es de fiar se atenúa y se dice:
 * un riesgo bajo sin datos suficientes no vale lo mismo que uno medido.
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
    <div className={confident ? "" : "opacity-60"}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span className="nums" style={{ color: toneColor(tone) }}>
          {score}/6 {caption}
        </span>
      </div>
      <div
        className="mt-1 flex gap-0.5"
        role="img"
        aria-label={`${label}: ${score} de 6`}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{
              background: i <= score ? toneColor(tone) : "var(--surface-2)",
            }}
          />
        ))}
      </div>
      {!confident && (
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Sin datos suficientes para fiarse de este número todavía.
        </p>
      )}
    </div>
  );
}
