import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { manualOverrides } from "@/lib/db/schema";
import { clearOverride, setOverride } from "@/lib/overrides";
import { SetupNotice } from "../setup-notice";

export const dynamic = "force-dynamic";

/**
 * La mitad manual de la ingesta híbrida.
 *
 * Sirve para dos cosas: corregir un dato que la API devuelve mal, y meter a
 * mano lo que la sincronización no consiga leer cuando cambie la API no
 * oficial. Las correcciones se aplican al leer, así que sobreviven a
 * cualquier resincronización.
 */

const ENTITIES = [
  "player",
  "manager",
  "roster_entry",
  "market_listing",
  "activity_event",
] as const;

async function saveOverride(formData: FormData): Promise<void> {
  "use server";

  const entity = String(formData.get("entity") ?? "");
  const entityId = String(formData.get("entityId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  const rawValue = String(formData.get("value") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!entity || !entityId || !field || rawValue === "") return;

  // Se acepta JSON para poder corregir números, booleanos y textos; si no
  // parsea, se guarda como cadena, que es lo que casi siempre se quiere.
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    value = rawValue;
  }

  await setOverride({
    entity,
    entityId,
    field,
    value,
    reason: reason || undefined,
  });
  revalidatePath("/overrides");
  revalidatePath("/");
}

async function removeOverride(formData: FormData): Promise<void> {
  "use server";

  await clearOverride(
    String(formData.get("entity") ?? ""),
    String(formData.get("entityId") ?? ""),
    String(formData.get("field") ?? ""),
  );
  revalidatePath("/overrides");
  revalidatePath("/");
}

export default async function OverridesPage() {
  let active;
  try {
    const db = getDb();
    active = await db
      .select()
      .from(manualOverrides)
      .where(eq(manualOverrides.active, true))
      .orderBy(desc(manualOverrides.createdAt));
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Correcciones manuales</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Se aplican encima de lo sincronizado. Una resincronización nunca las
          pisa.
        </p>
      </header>

      <form action={saveOverride} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Entidad
          <select
            name="entity"
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {ENTITIES.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Id
          <input
            name="entityId"
            required
            placeholder="id del jugador, manager..."
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Campo
          <input
            name="field"
            required
            placeholder="marketValue, buyoutClause, status..."
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Valor
          <input
            name="value"
            required
            placeholder='12000000  o  "injured"'
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Motivo (opcional, pero tu yo de dentro de un mes lo agradecerá)
          <input
            name="reason"
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Guardar corrección
          </button>
        </div>
      </form>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Activas ({active.length})
        </h2>

        {active.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Ninguna. Todo viene de la API.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((override) => (
              <li
                key={override.id}
                className="flex items-center justify-between gap-4 rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <div>
                  <code className="text-xs" style={{ color: "var(--muted)" }}>
                    {override.entity}:{override.entityId}
                  </code>
                  <div>
                    <strong>{override.field}</strong> ={" "}
                    {JSON.stringify(override.value)}
                  </div>
                  {override.reason ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{override.reason}</p>
                  ) : null}
                </div>

                <form action={removeOverride}>
                  <input type="hidden" name="entity" value={override.entity} />
                  <input
                    type="hidden"
                    name="entityId"
                    value={override.entityId}
                  />
                  <input type="hidden" name="field" value={override.field} />
                  <button
                    type="submit"
                    className="text-xs text-red-600 underline dark:text-red-400"
                  >
                    quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
