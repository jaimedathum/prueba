import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/queries";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../../setup-notice";
import { Pitch } from "../../pitch";
import {
  Empty,
  Figure,
  Lede,
  Page,
  RangeBar,
  Row,
  Section,
  Stat,
  Table,
  Td,
  Th,
} from "../../ui";
import { getRivalContext } from "../data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ managerId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { managerId } = await params;
  try {
    const context = await getRivalContext(decodeURIComponent(managerId));
    // El nombre del equipo en la pestaña: quien abre tres fichas a la vez
    // necesita distinguirlas sin volver a cada una.
    if (context) return { title: context.rival.teamName };
  } catch {
    // Sin base de datos no hay título que dar; la página ya lo explica.
  }
  return { title: "Rival" };
}

/**
 * La ficha de un rival.
 *
 * Contesta a una sola pregunta —"¿qué hago con este?"— y por eso lo enseña
 * todo de él sin esconderlo detrás de desplegables: aquí ya no compite por
 * espacio con otros nueve managers.
 *
 * Su caja sigue calculándose con la liga entera delante, porque calibrar el
 * modelo necesita el único saldo visible, que es el propio. Lo que cambia
 * es qué se pinta, no qué se calcula.
 */
export default async function RivalPage({ params }: Params) {
  const { managerId } = await params;

  let context;
  try {
    context = await getRivalContext(decodeURIComponent(managerId));
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (!context) notFound();

  const { rival, index, total, previous, next } = context;

  return (
    <Page
      eyebrow={
        <Link href="/rivales" className="no-underline hover:text-ink">
          ← La liga · {index + 1} de {total} por caja
        </Link>
      }
      title={rival.teamName}
      subtitle={
        rival.observedMoves === 0
          ? "Sin movimientos en el feed todavía, así que su caja es la del presupuesto inicial y su banda, la más ancha de la liga."
          : `Reconstruido desde ${rival.observedMoves} movimientos de su historial. Todo lo que sigue sale de ahí.`
      }
      meta={[
        { label: "Manager", value: rival.managerName ?? "sin nombre" },
        {
          label: "Patrimonio",
          value: formatMoney(rival.cash.point + rival.squadValue),
        },
        { label: "Plantilla", value: rival.squad.length },
      ]}
    >
      {/* --- Caja ---------------------------------------------------- */}
      <Section
        title="Lo que puede pagar"
        hint="El mínimo es el número que importa para defenderse: es lo que puede pagar con seguridad. La anchura mide lo que no se sabe, no un margen de error inventado."
      >
        <div className="max-w-xl">
          <Lede label="Caja estimada" value={formatMoney(rival.cash.point)} />
          <div className="mt-3">
            <RangeBar
              min={rival.cash.min}
              point={rival.cash.point}
              max={rival.cash.max}
              scaleMax={rival.cash.max}
              format={formatMoney}
            />
            <div className="flex justify-between font-mono text-[10px] tracking-[0.06em] text-faint">
              <span>SEGURO {formatMoney(rival.cash.min)}</span>
              <span>TECHO {formatMoney(rival.cash.max)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-5 border-y border-line py-4 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-line sm:[&>*]:px-5 sm:[&>*:first-child]:pl-0">
          <Stat
            label="Valor de su plantilla"
            value={formatMoney(rival.squadValue)}
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
          <Stat
            label="Multiplicador de puja"
            value={
              rival.bidMultiplier !== null
                ? `${rival.bidMultiplier.toFixed(2)}×`
                : "—"
            }
            hint={
              rival.bidMultiplier !== null
                ? "sobre el valor de mercado"
                : "sin compras observadas"
            }
          />
        </div>

        {rival.alerts.length > 0 && (
          <ul className="space-y-1.5">
            {rival.alerts.map((alert) => (
              <li
                key={alert}
                className="border-l-2 py-0.5 pl-3 text-[13px] leading-relaxed"
                style={{ borderColor: "var(--color-rule)" }}
              >
                {alert}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --- Objetivos ------------------------------------------------ */}
      <Section
        title="Le sale a cuenta quitarle"
        aside={
          rival.targets.length > 0 ? `${rival.targets.length} jugadores` : undefined
        }
        hint="El excedente ya descuenta lo que le pondrías en la caja al pagarle la cláusula."
      >
        {rival.targets.length === 0 ? (
          <Empty>
            Ninguno de sus jugadores compensa clausulárselo ahora mismo: o la
            cláusula está por encima de lo que aportan, o no te queda caja
            para pagarla.
          </Empty>
        ) : (
          <ul className="border-t border-line">
            {rival.targets.map((target) => (
              <li key={target.playerId} className="border-b border-line py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <strong className="text-[15px] font-semibold">
                      {target.name}
                    </strong>{" "}
                    <span className="eyebrow">
                      cláusula {formatMoney(target.clause)}
                    </span>
                  </span>
                  <span className="scoreline text-[18px] text-brand-ink">
                    +{formatMoney(target.netSurplus)}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
                  {target.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --- Su once -------------------------------------------------- */}
      {rival.starters.length > 0 && (
        <Section
          title="Lo mejor que puede alinear"
          aside={rival.formation ?? undefined}
          hint="Es el mejor once que puede poner, no el que va a poner: no sabemos a quién alineará. Suponer que se equivoca sería regalarle ventaja al análisis."
        >
          <div className="grid gap-7 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-10">
            <Pitch players={rival.starters} />
            <div>
              <p className="eyebrow border-b border-line py-2">Su plantilla</p>
              <ul className="sm:columns-2 sm:gap-8">
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
            </div>
          </div>
        </Section>
      )}

      {/* --- Libro de cuentas ----------------------------------------- */}
      {rival.movements.length > 0 && (
        <Section
          title="Su libro de cuentas"
          aside={`${rival.movements.length} movimientos`}
          hint="De aquí sale la caja de arriba. Empieza en el presupuesto inicial y se le aplica cada operación."
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
          <p className="max-w-3xl text-[12px] leading-relaxed text-faint">
            Una fila con <strong>?</strong> es un movimiento cuyo importe el
            feed no expone: a partir de ahí la banda se ensancha en vez de
            inventarse la cifra.
          </p>
        </Section>
      )}

      {/* --- Salto a la ficha de al lado ------------------------------- */}
      <nav className="rule flex items-stretch justify-between gap-4 pt-4">
        <Vecino rival={previous} direction="anterior" />
        <Vecino rival={next} direction="siguiente" />
      </nav>
    </Page>
  );
}

/**
 * Enlace a la ficha contigua en el orden por caja. Quien está comparando
 * dos rivales no debería tener que volver al índice entre uno y otro.
 */
function Vecino({
  rival,
  direction,
}: {
  rival: { managerId: string; teamName: string } | null;
  direction: "anterior" | "siguiente";
}) {
  const siguiente = direction === "siguiente";
  if (!rival) return <span className="flex-1" />;

  return (
    <Link
      href={`/rivales/${encodeURIComponent(rival.managerId)}`}
      className={`row-link -mx-2 flex flex-1 flex-col px-2 py-2 no-underline ${
        siguiente ? "items-end text-right" : "items-start"
      }`}
    >
      <span className="eyebrow">
        {siguiente ? "Con menos caja" : "Con más caja"}
      </span>
      <span className="mt-1 flex items-center gap-2 text-[14px] font-medium">
        {!siguiente && (
          <span aria-hidden className="row-arrow-back font-mono text-faint">
            ←
          </span>
        )}
        {rival.teamName}
        {siguiente && (
          <span aria-hidden className="row-arrow font-mono text-faint">
            →
          </span>
        )}
      </span>
    </Link>
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
