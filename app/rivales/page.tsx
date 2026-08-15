import { getRivalsDashboard } from "@/lib/engine/rivals-load";
import { formatMoney } from "@/lib/queries";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";
import { Pitch } from "../pitch";
import {
  Disclosure,
  Empty,
  Figure,
  Notice,
  Page,
  Panel,
  RangeBar,
  Row,
  Section,
  Stat,
  Table,
  Td,
  Th,
} from "../ui";

export const dynamic = "force-dynamic";

/**
 * La liga rival a rival.
 *
 * `/riesgo` responde a "¿cuán expuesto estoy?" mirando tu plantilla. Esto
 * responde a "¿qué hago con este?" mirando la suya, que es la pregunta que
 * uno se hace de verdad antes de gastar dinero.
 *
 * Van ordenados por la caja estimada, no por el techo de su banda: un techo
 * alto puede venir solo de que se sabe poco, y desconocimiento no es amenaza.
 */
export default async function RivalesPage() {
  let data;
  try {
    data = await getRivalsDashboard();
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
  // llena querría decir cosas distintas en cada tarjeta.
  const cashScale = Math.max(1, ...rivals.map((rival) => rival.cash.max));

  return (
    <Page
      eyebrow="La liga"
      title="Rivales"
      subtitle={`${rivals.length} equipos además del tuyo, ordenados por la caja que se les estima.`}
    >
      {warnings.length > 0 && (
        <Notice title="Lo que hay que tener en cuenta">
          <ul className="list-disc space-y-1 pl-4 marker:text-faint">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Section
        title={
          nextMatchday
            ? `Proyección desde la jornada ${nextMatchday}`
            : "Proyección de la liga"
        }
        hint="Puntos actuales más el mejor once repetido. A una jornada es una estimación; a diez, una tendencia."
      >
        <Panel>
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
                    <span className="inline-flex items-baseline gap-2">
                      <span
                        aria-hidden
                        className="inline-block w-[3px] self-stretch rounded"
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
                      style={
                        row.isMe
                          ? { color: "var(--color-brand-ink)", fontWeight: 600 }
                          : undefined
                      }
                    >
                      {p.points.toFixed(0)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <p className="text-[12px] leading-relaxed text-faint">
          <strong className="font-mono text-[11px] uppercase tracking-[0.08em]">
            /jor
          </strong>{" "}
          son los puntos del mejor once que cada uno puede poner. La proyección
          supone que la plantilla no cambia y que todos alinean bien: nadie sabe
          quién fichará ni quién se lesionará, así que a diez jornadas esto
          ordena, no predice.
        </p>
      </Section>

      {rivals.length === 0 ? (
        <Empty>
          No hay rivales en la liga todavía. Cuando se unan tus amigos y
          sincronices, aparecerán aquí.
        </Empty>
      ) : (
        <Section
          title="Rival a rival"
          aside={`${rivals.length} equipos`}
          hint="Lo que puede pagar, lo que puede alinear, y qué le sale a cuenta quitarle."
        >
          <div className="space-y-4">
            {rivals.map((rival) => (
              <Panel key={rival.managerId} className="space-y-5">
                {/* Identidad y caja: lo primero que se mira de un rival. */}
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[17px] font-semibold tracking-[-0.015em]">
                      {rival.teamName}
                    </h3>
                    <p className="eyebrow mt-0.5">
                      {rival.managerName ?? "Manager sin nombre"} ·{" "}
                      {rival.observedMoves === 0
                        ? "sin historial"
                        : `${rival.observedMoves} movimientos vistos`}
                    </p>
                  </div>

                  <div className="min-w-[13rem] flex-1 sm:max-w-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="eyebrow">Caja estimada</span>
                      <Figure
                        tone={rival.cash.point > 0 ? "warn" : "muted"}
                        className="text-[14px]"
                      >
                        {formatMoney(rival.cash.point)}
                      </Figure>
                    </div>
                    <RangeBar
                      min={rival.cash.min}
                      point={rival.cash.point}
                      max={rival.cash.max}
                      scaleMax={cashScale}
                      format={formatMoney}
                    />
                    <p className="text-[11px] text-faint">
                      seguro {formatMoney(rival.cash.min)} · techo{" "}
                      {formatMoney(rival.cash.max)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-4 sm:grid-cols-4">
                  <Stat
                    label="Patrimonio"
                    value={formatMoney(rival.cash.point + rival.squadValue)}
                    hint={`${formatMoney(rival.squadValue)} en jugadores`}
                  />
                  <Stat
                    label="Su mejor once"
                    value={rival.bestElevenPoints.toFixed(1)}
                    hint={rival.formation ?? "sin once posible"}
                  />
                  <Stat label="Plantilla" value={rival.squad.length} />
                  <Stat
                    label="Objetivos rentables"
                    value={rival.targets.length}
                    tone={rival.targets.length > 0 ? "brand" : "muted"}
                    hint={
                      rival.targets.length === 0
                        ? "nada compensa hoy"
                        : "de los suyos"
                    }
                  />
                </div>

                {rival.alerts.length > 0 && (
                  <ul className="space-y-1.5">
                    {rival.alerts.map((alert) => (
                      <li
                        key={alert}
                        className="border-l-2 py-0.5 pl-3 text-[13px] leading-relaxed"
                        style={{ borderColor: "var(--color-warn)" }}
                      >
                        {alert}
                      </li>
                    ))}
                  </ul>
                )}

                {rival.targets.length > 0 ? (
                  <div className="space-y-2">
                    <p className="eyebrow">Le sale a cuenta quitarle</p>
                    <ul>
                      {rival.targets.slice(0, 3).map((target) => (
                        <li
                          key={target.playerId}
                          className="border-b border-line py-2.5 last:border-b-0"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span>
                              <strong className="text-[14px] font-medium">
                                {target.name}
                              </strong>{" "}
                              <span className="eyebrow">
                                cláusula {formatMoney(target.clause)}
                              </span>
                            </span>
                            <Figure tone="brand" className="text-[14px]">
                              +{formatMoney(target.netSurplus)}
                            </Figure>
                          </div>
                          <p className="mt-1 text-[12px] leading-relaxed text-muted">
                            {target.reason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="space-y-3 border-t border-line pt-4">
                  {rival.starters.length > 0 && (
                    <Disclosure summary="Ver su mejor once sobre el campo">
                      <div className="space-y-2 sm:max-w-sm">
                        <Pitch players={rival.starters} />
                        <p className="text-[12px] leading-relaxed text-faint">
                          Es el mejor once que <strong>puede</strong> poner, no
                          el que va a poner: no sabemos a quién alineará.
                          Suponer que se equivoca sería regalarle ventaja al
                          análisis.
                        </p>
                      </div>
                    </Disclosure>
                  )}

                  {rival.movements.length > 0 && (
                    <Disclosure
                      summary={`Ver sus ${rival.movements.length} movimientos y cómo le quedó la caja`}
                    >
                      <Table>
                        <thead>
                          <tr>
                            <Th>Cuándo</Th>
                            <Th>Qué</Th>
                            <Th align="right">Importe</Th>
                            <Th align="right">Le queda</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {rival.movements.map((m) => (
                            <tr key={m.id}>
                              <Td className="whitespace-nowrap font-mono text-[11px] text-faint">
                                {m.occurredAt.toLocaleDateString("es-ES", {
                                  day: "2-digit",
                                  month: "short",
                                })}
                              </Td>
                              <Td>
                                {m.playerName ?? tipoLegible(m.type)}
                                {m.playerName && (
                                  <span className="eyebrow block">
                                    {tipoLegible(m.type)}
                                  </span>
                                )}
                              </Td>
                              <Td align="right" numeric>
                                <Figure
                                  tone={
                                    m.delta === null
                                      ? "muted"
                                      : m.delta < 0
                                        ? "bad"
                                        : "good"
                                  }
                                >
                                  {m.delta === null
                                    ? "sin importe"
                                    : `${m.delta > 0 ? "+" : ""}${formatMoney(m.delta)}`}
                                </Figure>
                              </Td>
                              <Td align="right" numeric>
                                {formatMoney(m.balanceAfter)}
                                {!m.certain && (
                                  <span
                                    className="ml-1 text-faint"
                                    title="El feed no expone el importe: desde aquí la banda se ensancha."
                                  >
                                    ?
                                  </span>
                                )}
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                      <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
                        Este es el libro de cuentas del que sale su caja
                        estimada. Empieza en el presupuesto inicial y se le
                        aplica cada operación. Una fila con <strong>?</strong> es
                        un movimiento cuyo importe el feed no expone: a partir de
                        ahí la banda se ensancha en vez de inventarse la cifra.
                      </p>
                    </Disclosure>
                  )}

                  <Disclosure
                    summary={`Ver su plantilla completa (${rival.squad.length})`}
                  >
                    <ul>
                      {rival.squad
                        .slice()
                        .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
                        .map((player) => (
                          <Row key={player.playerId}>
                            <span className="min-w-0 truncate text-[13px]">
                              {player.name}{" "}
                              <span className="font-mono text-[11px] uppercase text-faint">
                                {positionCode(player.positionId)}
                              </span>
                            </span>
                            <Figure className="shrink-0 text-[11px] text-faint">
                              {formatMoney(player.marketValue)}
                              {player.buyoutClause !== null && (
                                <> · {formatMoney(player.buyoutClause)}</>
                              )}
                            </Figure>
                          </Row>
                        ))}
                    </ul>
                  </Disclosure>
                </div>
              </Panel>
            ))}
          </div>
        </Section>
      )}

      <footer className="border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
        <p>
          La caja de cada rival es una <strong>banda</strong>, no una cifra: se
          reconstruye movimiento a movimiento desde el feed de actividad, y
          cuando un movimiento no expone su importe la banda se ensancha en vez
          de inventarse un número. Una banda ancha y honesta vale más que una
          cifra estrecha e inventada.
        </p>
      </footer>
    </Page>
  );
}

/** Los tipos internos del feed, en castellano. */
function tipoLegible(type: string): string {
  return (
    {
      market_purchase: "compra en el mercado",
      market_sale: "venta al mercado",
      clause_paid: "clausulazo pagado",
      clause_received: "clausulazo recibido",
      transfer_in: "fichaje",
      transfer_out: "traspaso",
      unknown: "movimiento sin clasificar",
    }[type] ?? type
  );
}
