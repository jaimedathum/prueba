import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { manualOverrides } from "@/lib/db/schema";

/**
 * Capa 3: correcciones manuales aplicadas ENCIMA de la capa derivada.
 *
 * Es la mitad "manual" de la ingesta híbrida. La clave del diseño es que los
 * overrides viven en su propia tabla y se aplican al leer, nunca al escribir:
 * así una resincronización jamás pisa una corrección hecha a mano, y la UI
 * puede distinguir el dato sincronizado del tocado.
 */

export type OverrideMap = Map<string, Record<string, unknown>>;

export interface Overridden {
  /** Campos que vienen de una corrección manual, no de la API. */
  overriddenFields: string[];
}

export async function loadOverrides(entity: string): Promise<OverrideMap> {
  const db = getDb();
  const rows = await db
    .select()
    .from(manualOverrides)
    .where(
      and(eq(manualOverrides.entity, entity), eq(manualOverrides.active, true)),
    );

  const map: OverrideMap = new Map();
  for (const row of rows) {
    const current = map.get(row.entityId) ?? {};
    current[row.field] = row.value;
    map.set(row.entityId, current);
  }
  return map;
}

/**
 * Aplica los overrides a una fila y deja constancia de qué se ha tocado.
 * Solo se sobrescriben campos que ya existen en la fila: un override sobre un
 * campo inexistente es casi siempre una errata, y se ignora en vez de
 * inventar una propiedad nueva.
 */
export function applyOverride<T extends object>(
  row: T,
  id: string,
  overrides: OverrideMap,
): T & Overridden {
  const patch = overrides.get(id);
  if (!patch) return { ...row, overriddenFields: [] };

  const result = { ...row } as Record<string, unknown>;
  const applied: string[] = [];

  for (const [field, value] of Object.entries(patch)) {
    if (field in result) {
      result[field] = value;
      applied.push(field);
    }
  }

  return { ...(result as T), overriddenFields: applied };
}

export function applyOverrides<T extends object>(
  rows: T[],
  getId: (row: T) => string,
  overrides: OverrideMap,
): Array<T & Overridden> {
  return rows.map((row) => applyOverride(row, getId(row), overrides));
}

export async function setOverride(input: {
  entity: string;
  entityId: string;
  field: string;
  value: unknown;
  reason?: string;
}): Promise<void> {
  const db = getDb();
  // Se desactiva el anterior en vez de borrarlo: queda el rastro de qué se
  // corrigió y por qué.
  await db
    .update(manualOverrides)
    .set({ active: false })
    .where(
      and(
        eq(manualOverrides.entity, input.entity),
        eq(manualOverrides.entityId, input.entityId),
        eq(manualOverrides.field, input.field),
        eq(manualOverrides.active, true),
      ),
    );

  await db.insert(manualOverrides).values({
    entity: input.entity,
    entityId: input.entityId,
    field: input.field,
    value: input.value as object,
    reason: input.reason ?? null,
  });
}

export async function clearOverride(
  entity: string,
  entityId: string,
  field: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(manualOverrides)
    .set({ active: false })
    .where(
      and(
        eq(manualOverrides.entity, entity),
        eq(manualOverrides.entityId, entityId),
        eq(manualOverrides.field, field),
        eq(manualOverrides.active, true),
      ),
    );
}
