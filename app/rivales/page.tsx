import Link from "next/link";
import { formatMoney } from "@/lib/queries";
import { SetupNotice } from "../setup-notice";
import {
  Empty,
  ModelWarnings,
  Page,
  RangeBar,
  Section,
  Table,
  Td,
  Th,
} from "../ui";
import { getLeague } from "./data";

export const dynamic = "force-dynamic";

/**
 * La liga, de un vistazo.
 *
 * Antes esta pantalla lo enseñaba todo de todos: diez fichas completas, con
 * su plantilla, su libro de cuentas y su once, una detrás de otra. Servía
 * para husmear, no para decidir, y obligaba a desplazarse metros para
 * comparar dos managers.
 *
 * Ahora el índice contesta a "¿de quién me tengo que preocupar?" —caja,
 * potencial y cuántos de los suyos me compensa clausular— y el detalle de
 * cada uno vive en su propia dirección, que además se puede compartir y
 * volver a abrir.
 */
export default async function RivalesPage() {
  let data;
  try {
    data = await getLeague();
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (!data) {
    return (
      <Page eyebrow="La liga" title="Rivales">
        <Empty>
          Todavía no se ha identificado tu equipo dentro de la liga. Pulsa
          Sincronizar arriba.
        </Empty>
      </Page>
    );
  }

  const { rivals, standings, nextMatchday, warnings } = data;

  // Todas las bandas se dibujan contra el mismo techo; si no, una barra
  // llena querría decir cosas distintas en cada fila.
  const cashScale = Math.max(1, ...rivals.map((rival) => rival.cash.max));
  const amenazas = rivals.filter((rival) => rival.targets.length > 0).length;

  return (
    <Page
      eyebrow="La liga"
      title="Rivales"
      subtitle="La caja de cada rival es una banda, no una cifra: se reconstruye movimiento a movimiento desde el feed de actividad, y cuando un movimiento no expone su importe la banda se ensancha en vez de inventarse un número."
      meta={[
        { label: "Equipos", value: rivals.length },
        { label: "Con algo que quitarles", value: amenazas },
        { label: "Próxima jornada", value: nextMatchday ?? "—" },
      ]}
    >
      <Section
        title={
          nextMatchday
            ? `Proyección desde la jornada ${nextMatchday}`
            : "Proyección"
        }
        hint="Puntos actuales más el mejor once repetido. La proyección supone que la plantilla no cambia y que todos alinean bien: a diez jornadas esto ordena, no predice."
      >
        <Table>
          <thead>
            <tr>
              <Th>Equipo</Th>
              <Th align="right">Hoy</Th>
              <Th align="right">/jor</Th>
              {standings[0]?.projections.map((p) => (
                <Th key={p.matchdays} align="right">
                  +{p.matchdays}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => (
              <tr key={row.managerId}>
                <Td className="whitespace-nowrap">
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-3.5 w-[3px] shrink-0"
                      style={{
                        background: row.isMe
                          ? "var(--color-brand)"
                          : "transparent",
                      }}
                    />
                    <span className="nums font-mono text-[11px] text-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={row.isMe ? "font-semibold" : ""}>
                      {row.teamName}
                    </span>
                  </span>
                </Td>
                <Td align="right" numeric>
                  {row.currentPoints ?? "—"}
                </Td>
                <Td align="right" numeric className="text-faint">
                  {row.perMatchday.toFixed(1)}
                </Td>
                {row.projections.map((p) => (
                  <Td
                    key={p.matchdays}
                    align="right"
                    numeric
                    className={row.isMe ? "font-semibold" : undefined}
                  >
                    {p.points.toFixed(0)}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>

        <p className="text-[12px] leading-relaxed text-faint">
          <strong className="font-mono text-[11px] uppercase tracking-[0.1em]">
            /jor
          </strong>{" "}
          son los puntos del mejor once que cada uno puede poner: nadie sabe
          quién fichará ni quién se lesionará.
        </p>
      </Section>

      {rivals.length === 0 ? (
        <Empty>
          No hay rivales en la liga todavía. Cuando se unan tus amigos y
          sincronices, aparecerán aquí.
        </Empty>
      ) : (
        <Section
          title="Quién es quién"
          aside={`${rivals.length} equipos`}
          hint="Ordenados por la caja que se les estima, no por el techo de su banda: un techo alto puede venir solo de que se sabe poco, y desconocimiento no es amenaza. Pulsa en cualquiera para ver su ficha."
        >
          <ul className="border-t border-line">
            {rivals.map((rival, index) => (
              <li key={rival.managerId}>
                <Link
                  href={`/rivales/${encodeURIComponent(rival.managerId)}`}
                  className="row-link -mx-2 flex items-center gap-4 border-b border-line px-2 py-4 no-underline"
                >
                  <span className="nums w-6 shrink-0 font-mono text-[11px] text-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold tracking-[-0.015em]">
                      {rival.teamName}
                    </span>
                    <span className="eyebrow mt-1 block truncate">
                      {rival.managerName ?? "Manager sin nombre"} ·{" "}
                      {rival.observedMoves === 0
                        ? "sin historial"
                        : `${rival.observedMoves} movimientos`}
                    </span>
                  </span>

                  <span className="hidden w-44 shrink-0 sm:block">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="eyebrow">Caja</span>
                      <span className="scoreline text-[14px]">
                        {formatMoney(rival.cash.point)}
                      </span>
                    </span>
                    <RangeBar
                      min={rival.cash.min}
                      point={rival.cash.point}
                      max={rival.cash.max}
                      scaleMax={cashScale}
                      format={formatMoney}
                    />
                  </span>

                  <span className="hidden w-20 shrink-0 text-right md:block">
                    <span className="eyebrow block">Mejor once</span>
                    <span className="scoreline mt-1 block text-[16px]">
                      {rival.bestElevenPoints.toFixed(1)}
                    </span>
                  </span>

                  <span className="w-16 shrink-0 text-right">
                    <span className="eyebrow block">Quitarle</span>
                    <span
                      className="scoreline mt-1 block text-[16px]"
                      style={{
                        color:
                          rival.targets.length > 0
                            ? "var(--color-brand-ink)"
                            : "var(--color-faint)",
                      }}
                    >
                      {rival.targets.length}
                    </span>
                  </span>

                  <span
                    aria-hidden
                    className="row-arrow shrink-0 font-mono text-[13px] text-faint"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {warnings.length > 0 && (
        <footer className="rule pt-4 text-[12px] leading-relaxed text-faint">
          <ModelWarnings warnings={warnings} />
        </footer>
      )}
    </Page>
  );
}
