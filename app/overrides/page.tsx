import { resolveTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { LOCKED_MESSAGE, hasAdminSession, requireAdminSession } from "@/lib/admin-gate";
import { getDb } from "@/lib/db";
import { manualOverrides } from "@/lib/db/schema";
import { clearOverride, setOverride } from "@/lib/overrides";
import { SetupNotice } from "../setup-notice";
import {
  Button,
  Empty,
  Field,
  Input,
  Notice,
  Page,
  Section,
  Select,
} from "../ui";

export const dynamic = "force-dynamic";

/**
 * La mitad manual de la ingesta híbrida.
 *
 * Sirve para dos cosas: corregir un dato que la API devuelve mal, y meter a
 * mano lo que la sincronización no consiga leer cuando cambie la API no
 * oficial. Las correcciones se aplican al leer, así que sobreviven a
 * cualquier resincronización.
 *
 * Y justo eso —que sobrevivan— es lo que obliga a cerrar esta página con
 * llave: un valor metido aquí se aplica encima de todo lo sincronizado y no
 * hay resincronización que lo borre. Sin puerta, era escritura arbitraria y
 * permanente en la base de datos desde una URL pública.
 */

const ENTITIES = [
  "player",
  "manager",
  "roster_entry",
  "market_listing",
  "activity_event",
] as const;

type Entity = (typeof ENTITIES)[number];

function isEntity(value: string): value is Entity {
  return (ENTITIES as readonly string[]).includes(value);
}

/**
 * Un override apunta a un campo de una fila concreta, así que el id y el campo
 * son cortos por naturaleza. El tope está para que un formulario manipulado no
 * pueda usar esta tabla como almacén.
 */
const MAX_FIELD_LENGTH = 120;
const MAX_VALUE_LENGTH = 2_000;
const MAX_REASON_LENGTH = 500;

async function saveOverride(formData: FormData): Promise<void> {
  "use server";

  if (!(await requireAdminSession()).ok) return;

  const entity = String(formData.get("entity") ?? "");
  const entityId = String(formData.get("entityId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  const rawValue = String(formData.get("value") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  // El desplegable solo ofrece estas cinco, pero el formulario se puede
  // falsificar: una entidad inventada crearía overrides que no lee nadie.
  if (!isEntity(entity)) return;
  if (!entityId || !field || rawValue === "") return;
  if (
    entityId.length > MAX_FIELD_LENGTH ||
    field.length > MAX_FIELD_LENGTH ||
    rawValue.length > MAX_VALUE_LENGTH ||
    reason.length > MAX_REASON_LENGTH
  ) {
    return;
  }

  // Se acepta JSON para poder corregir números, booleanos y textos; si no
  // parsea, se guarda como cadena, que es lo que casi siempre se quiere.
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    value = rawValue;
  }

  await setOverride({
    accountId: (await resolveTenant()).accountId,
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

  if (!(await requireAdminSession()).ok) return;

  const { accountId } = await resolveTenant();
  await clearOverride(
    accountId,
    String(formData.get("entity") ?? ""),
    String(formData.get("entityId") ?? ""),
    String(formData.get("field") ?? ""),
  );
  revalidatePath("/overrides");
  revalidatePath("/");
}

export default async function OverridesPage() {
  const unlocked = await hasAdminSession();

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
    <Page
      eyebrow="Sistema"
      title="Correcciones manuales"
      subtitle="La mitad manual de la ingesta híbrida: se aplican encima de lo sincronizado y una resincronización nunca las pisa. Por eso mismo la página va bajo llave."
    >
      {!unlocked && (
        <Notice tone="muted" title="Solo lectura">
          {LOCKED_MESSAGE} Mientras tanto, las correcciones activas se pueden
          consultar pero no cambiar.
        </Notice>
      )}

      {unlocked && (
        <Section
          title="Nueva corrección"
          hint="El valor se interpreta como JSON si puede; si no, se guarda tal cual. Así se corrigen números, booleanos y textos con el mismo campo."
        >
          <form action={saveOverride} className="grid max-w-3xl gap-5 sm:grid-cols-2">
            <Field label="Entidad">
              <Select name="entity">
                {ENTITIES.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Id">
              <Input
                name="entityId"
                required
                placeholder="id del jugador, manager…"
              />
            </Field>

            <Field label="Campo">
              <Input
                name="field"
                required
                placeholder="marketValue, buyoutClause, status…"
              />
            </Field>

            <Field label="Valor">
              <Input name="value" required placeholder='12000000  o  "injured"' />
            </Field>

            <Field
              label="Motivo"
              hint="Opcional, pero tu yo de dentro de un mes lo agradecerá."
              className="sm:col-span-2"
            >
              <Input name="reason" placeholder="Por qué no vale el dato de la API" />
            </Field>

            <div className="sm:col-span-2">
              <Button type="submit" variant="primary">
                Guardar corrección
              </Button>
            </div>
          </form>
        </Section>
      )}

      <Section title="Activas" aside={`${active.length} en vigor`}>
        {active.length === 0 ? (
          <Empty>
            Ninguna corrección activa: todo lo que se enseña viene tal cual de
            la API.
          </Empty>
        ) : (
          <ul className="border-t border-line">
            {active.map((override) => (
              <li
                key={override.id}
                className="flex items-start justify-between gap-4 border-b border-line py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="eyebrow">
                    {override.entity} · {override.entityId}
                  </p>
                  <p className="text-[14px]">
                    <strong className="font-medium">{override.field}</strong>
                    <span className="mx-1.5 text-faint">=</span>
                    <code>{JSON.stringify(override.value)}</code>
                  </p>
                  {override.reason ? (
                    <p className="text-[12px] leading-relaxed text-muted">
                      {override.reason}
                    </p>
                  ) : null}
                </div>

                {unlocked && (
                  <form action={removeOverride} className="shrink-0">
                    <input type="hidden" name="entity" value={override.entity} />
                    <input
                      type="hidden"
                      name="entityId"
                      value={override.entityId}
                    />
                    <input type="hidden" name="field" value={override.field} />
                    <Button type="submit" variant="danger">
                      Quitar
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
