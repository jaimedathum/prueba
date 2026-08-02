/**
 * Lectura tolerante de las respuestas de la API.
 *
 * Los nombres exactos de los campos de la API no oficial no están verificados
 * y además cambian sin aviso. En vez de fijar un nombre y romperse en
 * silencio, cada campo se busca entre varios alias plausibles y se registra:
 *
 *   - qué claves no se encontraron (`misses`), para saber qué arreglar
 *   - qué claves de la respuesta nadie leyó (`unusedKeys`), para descubrir
 *     datos útiles que aún no se están aprovechando
 *
 * `npm run sync -- --shape` imprime ese informe. Es la herramienta con la que
 * se cierra el mapeo en cuanto se ven datos reales.
 */

export type Json = Record<string, unknown>;

export function isJsonObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FieldMapper {
  readonly misses: string[] = [];
  private readonly consumed = new Set<string>();

  constructor(
    private readonly source: Json,
    private readonly context: string,
  ) {}

  private raw(keys: string[]): unknown {
    for (const key of keys) {
      // Soporta rutas anidadas del tipo "team.id".
      const value = key.includes(".")
        ? key.split(".").reduce<unknown>((acc, part) => {
            return isJsonObject(acc) ? acc[part] : undefined;
          }, this.source)
        : this.source[key];

      if (value !== undefined && value !== null) {
        this.consumed.add(key.split(".")[0]!);
        return value;
      }
    }
    this.misses.push(`${this.context}.{${keys.join("|")}}`);
    return undefined;
  }

  string(...keys: string[]): string | null {
    const value = this.raw(keys);
    if (value === undefined) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return null;
  }

  number(...keys: string[]): number | null {
    const value = this.raw(keys);
    if (value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      // Los importes llegan a veces como "12.500.000" o "12500000.0".
      const cleaned = value.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  boolean(...keys: string[]): boolean | null {
    const value = this.raw(keys);
    if (value === undefined) return null;
    if (typeof value === "boolean") return value;
    if (value === "true" || value === 1) return true;
    if (value === "false" || value === 0) return false;
    return null;
  }

  date(...keys: string[]): Date | null {
    const value = this.raw(keys);
    if (value === undefined) return null;
    // Epoch en segundos o en milisegundos, o ISO-8601.
    if (typeof value === "number") {
      const ms = value < 1e12 ? value * 1000 : value;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  object(...keys: string[]): Json | null {
    const value = this.raw(keys);
    return isJsonObject(value) ? value : null;
  }

  array(...keys: string[]): unknown[] | null {
    const value = this.raw(keys);
    return Array.isArray(value) ? value : null;
  }

  /** Campos presentes en la respuesta que ningún mapeo ha leído todavía. */
  unusedKeys(): string[] {
    return Object.keys(this.source).filter((key) => !this.consumed.has(key));
  }
}

/** Informe agregado del mapeo, para cerrar los parsers con datos reales. */
export interface ShapeReport {
  context: string;
  samples: number;
  missingFields: Record<string, number>;
  unusedFields: Record<string, number>;
}

export class ShapeCollector {
  private readonly reports = new Map<string, ShapeReport>();

  add(context: string, mapper: FieldMapper): void {
    const report = this.reports.get(context) ?? {
      context,
      samples: 0,
      missingFields: {},
      unusedFields: {},
    };
    report.samples++;
    for (const miss of mapper.misses) {
      report.missingFields[miss] = (report.missingFields[miss] ?? 0) + 1;
    }
    for (const unused of mapper.unusedKeys()) {
      report.unusedFields[unused] = (report.unusedFields[unused] ?? 0) + 1;
    }
    this.reports.set(context, report);
  }

  all(): ShapeReport[] {
    return [...this.reports.values()];
  }

  format(): string {
    const lines: string[] = [];
    for (const report of this.all()) {
      lines.push(`\n${report.context}  (${report.samples} muestras)`);

      const missing = Object.entries(report.missingFields).sort(
        (a, b) => b[1] - a[1],
      );
      if (missing.length > 0) {
        lines.push("  NO ENCONTRADOS (hay que corregir el mapeo):");
        for (const [field, count] of missing) {
          lines.push(`    ${count}x  ${field}`);
        }
      }

      const unused = Object.entries(report.unusedFields).sort(
        (a, b) => b[1] - a[1],
      );
      if (unused.length > 0) {
        lines.push("  SIN USAR (datos disponibles que no se aprovechan):");
        for (const [field, count] of unused) {
          lines.push(`    ${count}x  ${field}`);
        }
      }

      if (missing.length === 0 && unused.length === 0) {
        lines.push("  mapeo completo");
      }
    }
    return lines.join("\n");
  }
}
