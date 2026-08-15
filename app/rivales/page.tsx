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
  // llena querría decir cosas distintas en cada ficha.
  const cashScale = Math.max(1, ...rivals.map((rival) => rival.cash.max));

  return (
    <Page
      eyebrow="La liga"
      title="Rivales"
      subtitle="La caja de cada rival es una banda, no una cifra: se reconstruye movimiento a movimiento desde el feed de actividad, y cuando un movimiento no expone su importe la banda se ensancha en vez de inventarse un número."
      meta={[
        { label: "Equipos", value: rivals.length },
        { label: "Próxima jornada", value: nextMatchday ?? "—" },
      ]}
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
          nextMatchday ? `Proyección desde la jornada ${nextMatchday}` : "Proyección"
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
          title="Rival a rival"
          aside={`${rivals.length} equipos`}
          hint="Lo que puede pagar, lo que puede alinear, y qué le sale a cuenta quitarle."
        >
          <div className="border-t border-line">
            {rivals.map((rival) => (
              <article
                key={rival.managerId}
                className="space-y-5 border-b border-line py-6"
              >
                {/* Identidad y caja: lo primero que se mira de un rival. */}
                <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-[20px] font-semibold tracking-[-0.02em]">
                      {rival.teamName}
                    </h3>
                    <p className="eyebrow mt-1">
                      {rival.managerName ?? "Manager sin nombre"} ·{" "}
                      {rival.observedMoves === 0
                        ? "sin historial"
                        : `${rival.observedMoves} movimientos vistos`}
                    </p>
                  </div>

                  <div className="min-w-[14rem] flex-1 sm:max-w-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="eyebrow">Caja estimada</span>
                      <span className="scoreline text-[18px]">
                        {formatMoney(rival.cash.point)}
                      </span>
                    </div>
                    <RangeBar
                      min={rival.cash.min}
                      point={rival.cash.point}
                      max={rival.cash.max}
                      scaleMax={cashScale}
                      format={formatMoney}
                    />
                    <p className="font-mono text-[10px] tracking-[0.06em] text-faint">
                      SEGURO {formatMoney(rival.cash.min)} · TECHO{" "}
                      {formatMoney(rival.cash.max)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-5 border-y border-line py-4 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-line sm:[&>*]:px-5 sm:[&>*:first-child]:pl-0">
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
                    label="Le sale a cuenta quitarle"
                    value={rival.targets.length}
                    hint={
                      rival.targets.length === 0 ? "nada compensa hoy" : "jugadores"
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
                        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted">
                          {target.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div>
                  {rival.starters.length > 0 && (
                    <Disclosure summary="Ver su mejor once sobre el campo">
                      <div className="space-y-2 sm:max-w-xs">
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
                      <p className="mt-2.5 max-w-3xl text-[12px] leading-relaxed text-faint">
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
                    <ul className="sm:columns-2 sm:gap-10">
                      {rival.squad
                        .slice()
                        .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
                        .map((player) => (
                          <Row key={player.playerId} className="break-inside-avoid">
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
              </article>
            ))}
          </div>
        </Section>
      )}
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
