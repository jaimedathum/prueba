import { getRivalsDashboard } from "@/lib/engine/rivals-load";
import { formatMoney } from "@/lib/queries";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";
import { Pitch } from "../pitch";
import { Card, Empty, Notice, Page, Section, Stat, StatGrid } from "../ui";

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
      <Page title="Rivales">
        <Empty>
          Todavía no se ha identificado tu equipo dentro de la liga. Pulsa
          Sincronizar arriba.
        </Empty>
      </Page>
    );
  }

  const { rivals, standings, nextMatchday, warnings } = data;

  return (
    <Page
      title="Rivales"
      subtitle={`${rivals.length} en tu liga, ordenados por la caja que se les estima.`}
    >
      {warnings.length > 0 && (
        <Notice title="Lo que hay que tener en cuenta">
          <ul className="list-disc space-y-1 pl-5">
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
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left text-xs uppercase"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                <th className="py-2 pr-3">Equipo</th>
                <th className="py-2 pr-3 text-right">Hoy</th>
                <th className="py-2 pr-3 text-right">/jor</th>
                {standings[0]?.projections.map((p) => (
                  <th key={p.matchdays} className="py-2 pr-3 text-right">
                    +{p.matchdays}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((row, index) => (
                <tr
                  key={row.managerId}
                  className="border-b"
                  style={{
                    borderColor: "var(--border)",
                    background: row.isMe ? "var(--surface-2)" : undefined,
                  }}
                >
                  <td className="py-2 pr-3">
                    <span style={{ color: "var(--muted)" }}>{index + 1}.</span>{" "}
                    <span className={row.isMe ? "font-semibold" : ""}>
                      {row.teamName}
                    </span>
                  </td>
                  <td className="nums py-2 pr-3 text-right">
                    {row.currentPoints ?? "—"}
                  </td>
                  <td
                    className="nums py-2 pr-3 text-right"
                    style={{ color: "var(--muted)" }}
                  >
                    {row.perMatchday.toFixed(1)}
                  </td>
                  {row.projections.map((p) => (
                    <td
                      key={p.matchdays}
                      className="nums py-2 pr-3 text-right"
                      style={{
                        color: row.isMe ? "var(--accent)" : undefined,
                        fontWeight: row.isMe ? 600 : undefined,
                      }}
                    >
                      {p.points.toFixed(0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          <strong>/jor</strong> son los puntos del mejor once que cada uno
          puede poner. La proyección supone que la plantilla no cambia y que
          todos alinean bien: nadie sabe quién fichará ni quién se lesionará,
          así que a diez jornadas esto ordena, no predice.
        </p>
      </Section>

      {rivals.length === 0 ? (
        <Empty>
          No hay rivales en la liga todavía. Cuando se unan tus amigos y
          sincronices, aparecerán aquí.
        </Empty>
      ) : (
        rivals.map((rival) => (
          <Section
            key={rival.managerId}
            title={rival.teamName}
            hint={rival.managerName ?? undefined}
          >
            <Card>
              <StatGrid>
                <Stat
                  label="Caja estimada"
                  value={formatMoney(rival.cash.point)}
                  hint={`entre ${formatMoney(rival.cash.min)} y ${formatMoney(rival.cash.max)}`}
                  tone={rival.cash.point > 0 ? "warn" : "muted"}
                />
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
                <Stat
                  label="Movimientos vistos"
                  value={rival.observedMoves}
                  hint={rival.observedMoves === 0 ? "aún sin historial" : undefined}
                />
              </StatGrid>
            </Card>

            {rival.alerts.length > 0 && (
              <ul className="space-y-2">
                {rival.alerts.map((alert) => (
                  <li key={alert}>
                    <Card className="text-sm">{alert}</Card>
                  </li>
                ))}
              </ul>
            )}

            {rival.starters.length > 0 && (
              <details>
                <summary
                  className="cursor-pointer text-sm"
                  style={{ color: "var(--muted)" }}
                >
                  Ver su mejor once sobre el campo
                </summary>
                <div className="mt-2 space-y-2">
                  <Pitch players={rival.starters} />
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Es el mejor once que <strong>puede</strong> poner, no el que
                    va a poner: no sabemos a quién alineará. Suponer que se
                    equivoca sería regalarle ventaja al análisis.
                  </p>
                </div>
              </details>
            )}

            {rival.targets.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Le sale a cuenta quitarle
                </p>
                <ul className="space-y-2">
                  {rival.targets.slice(0, 3).map((target) => (
                    <li key={target.playerId}>
                      <Card className="space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <strong className="text-sm">
                            {target.name}{" "}
                            <span
                              className="font-normal"
                              style={{ color: "var(--muted)" }}
                            >
                              cláusula {formatMoney(target.clause)}
                            </span>
                          </strong>
                          <span
                            className="nums text-sm font-semibold"
                            style={{ color: "var(--accent)" }}
                          >
                            +{formatMoney(target.netSurplus)}
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          {target.reason}
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Ninguno de sus jugadores compensa clausulárselo ahora mismo.
              </p>
            )}

            {rival.movements.length > 0 && (
              <details>
                <summary
                  className="cursor-pointer text-sm"
                  style={{ color: "var(--muted)" }}
                >
                  Ver sus {rival.movements.length} movimientos y cómo le
                  quedó la caja
                </summary>
                <div className="table-scroll mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="border-b text-left text-xs uppercase"
                        style={{
                          borderColor: "var(--border)",
                          color: "var(--muted)",
                        }}
                      >
                        <th className="py-2 pr-3">Cuándo</th>
                        <th className="py-2 pr-3">Qué</th>
                        <th className="py-2 pr-3 text-right">Importe</th>
                        <th className="py-2 text-right">Le queda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rival.movements.map((m) => (
                        <tr
                          key={m.id}
                          className="border-b"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <td
                            className="py-2 pr-3 text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            {m.occurredAt.toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </td>
                          <td className="py-2 pr-3">
                            {m.playerName ?? tipoLegible(m.type)}
                            {m.playerName && (
                              <span
                                className="block text-xs"
                                style={{ color: "var(--muted)" }}
                              >
                                {tipoLegible(m.type)}
                              </span>
                            )}
                          </td>
                          <td
                            className="nums py-2 pr-3 text-right"
                            style={{
                              color:
                                m.delta === null
                                  ? "var(--muted)"
                                  : m.delta < 0
                                    ? "var(--bad)"
                                    : "var(--good)",
                            }}
                          >
                            {m.delta === null
                              ? "sin importe"
                              : `${m.delta > 0 ? "+" : ""}${formatMoney(m.delta)}`}
                          </td>
                          <td className="nums py-2 text-right">
                            {formatMoney(m.balanceAfter)}
                            {!m.certain && (
                              <span
                                className="ml-1 text-xs"
                                style={{ color: "var(--muted)" }}
                                title="El feed no expone el importe: desde aquí la banda se ensancha."
                              >
                                ?
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Este es el libro de cuentas del que sale su caja estimada.
                  Empieza en el presupuesto inicial y se le aplica cada
                  operación. Una fila con <strong>?</strong> es un movimiento
                  cuyo importe el feed no expone: a partir de ahí la banda se
                  ensancha en vez de inventarse la cifra.
                </p>
              </details>
            )}

            <details>
              <summary
                className="cursor-pointer text-sm"
                style={{ color: "var(--muted)" }}
              >
                Ver su plantilla completa ({rival.squad.length})
              </summary>
              <ul className="mt-2 space-y-1 text-sm">
                {rival.squad
                  .slice()
                  .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
                  .map((player) => (
                    <li
                      key={player.playerId}
                      className="flex items-baseline justify-between gap-3 border-b py-1"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="min-w-0 truncate">
                        {player.name}{" "}
                        <span style={{ color: "var(--muted)" }}>
                          {positionCode(player.positionId)}
                        </span>
                      </span>
                      <span className="nums shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                        {formatMoney(player.marketValue)}
                        {player.buyoutClause !== null && (
                          <> · cláusula {formatMoney(player.buyoutClause)}</>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          </Section>
        ))
      )}

      <footer
        className="border-t pt-4 text-xs"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
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
