import { getDashboardData, formatMoney } from "@/lib/queries";
import { SetupNotice } from "./setup-notice";
import {
  Badge,
  Empty,
  Figure,
  Page,
  Panel,
  Section,
  Stat,
  StatGrid,
  Table,
  Td,
  Th,
} from "./ui";

export const dynamic = "force-dynamic";

/**
 * Plantilla propia y estado de la ingesta.
 *
 * Es la pantalla de comprobación: sirve para verificar jugador a jugador que
 * lo sincronizado coincide con la app oficial. Por eso enseña la cláusula y su
 * ratio, que es lo que no se ve cómodamente en el juego.
 *
 * El mismo listado se pinta de dos maneras. En móvil, una tarjeta por
 * jugador: seis columnas en 375px obligan a desplazar en horizontal para leer
 * una fila, que es justo lo que hace inservible una tabla en el bolsillo. A
 * partir de tablet, tabla de verdad, que es como se compara una plantilla
 * entera de un vistazo.
 */
export default async function Home() {
  let data;
  try {
    data = await getDashboardData();
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  const { me, squad, lastSync } = data;
  const enRiesgo = squad.filter(
    (p) => p.clauseRatio !== null && p.clauseRatio < 1,
  ).length;
  const valorTotal = squad.reduce((total, p) => total + (p.marketValue ?? 0), 0);

  return (
    <Page
      eyebrow="Mi equipo"
      title={me ? me.teamName : "Equipo sin identificar"}
      subtitle={
        me?.reportedBalance != null
          ? `Saldo disponible ${formatMoney(me.reportedBalance)}. Es el único saldo visible de la liga, y por eso es el patrón contra el que se calibra todo lo demás.`
          : "Saldo no disponible todavía. Sincroniza para traerlo."
      }
    >
      <Panel>
        <StatGrid>
          <Stat
            label="Jugadores"
            value={squad.length}
            hint={valorTotal > 0 ? `${formatMoney(valorTotal)} en valor` : undefined}
          />
          <Stat
            label="Cláusula bajo valor"
            value={enRiesgo}
            tone={enRiesgo > 0 ? "warn" : "good"}
            hint={enRiesgo > 0 ? "salen baratos a un rival" : "ninguno barato"}
          />
          <Stat
            label="Última lectura"
            value={
              lastSync
                ? lastSync.startedAt.toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            }
            hint={
              lastSync
                ? lastSync.startedAt.toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "long",
                  })
                : "sin ejecutar"
            }
            tone={lastSync?.status === "failed" ? "bad" : undefined}
          />
          <Stat
            label="Estado"
            value={lastSync ? estadoLegible(lastSync.status) : "—"}
            tone={
              lastSync?.status === "ok"
                ? "good"
                : lastSync?.status === "failed"
                  ? "bad"
                  : "muted"
            }
          />
        </StatGrid>

        {lastSync?.error && (
          <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-bad">
            {lastSync.error}
          </p>
        )}
      </Panel>

      <Section
        title="Mi plantilla"
        aside={`${squad.length} jugadores`}
        hint="El ratio es cláusula ÷ valor. Por debajo de 1, el jugador le sale barato a un rival: pagarla le cuesta menos de lo que vale lo que se lleva."
      >
        {squad.length === 0 ? (
          <Empty>
            Sin jugadores todavía. Comprueba en{" "}
            <a className="font-medium text-brand-ink underline" href="/setup">
              la puesta en marcha
            </a>{" "}
            que la sincronización ha identificado tu equipo dentro de la liga.
          </Empty>
        ) : (
          <>
            {/* Móvil: una tarjeta por jugador. */}
            <ul className="space-y-2 sm:hidden">
              {squad.map((row) => (
                <Panel key={row.playerId} as="li" className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium">
                        {row.name}
                      </span>
                      <Marcas row={row} />
                    </div>
                    <div className="eyebrow mt-1">
                      {row.position} · {formatMoney(row.marketValue)}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <Figure className="block text-[13px]">
                      {formatMoney(row.buyoutClause)}
                    </Figure>
                    <ClauseRatio ratio={row.clauseRatio} />
                  </div>
                </Panel>
              ))}
            </ul>

            {/* Tablet en adelante: tabla, que compara mejor. */}
            <div className="hidden sm:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Jugador</Th>
                    <Th>Pos</Th>
                    <Th align="right">Valor</Th>
                    <Th align="right">Cláusula</Th>
                    <Th align="right">Ratio</Th>
                  </tr>
                </thead>
                <tbody>
                  {squad.map((row) => (
                    <tr key={row.playerId}>
                      <Td>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{row.name}</span>
                          <Marcas row={row} />
                        </span>
                      </Td>
                      <Td className="font-mono text-[11px] uppercase text-faint">
                        {row.position}
                      </Td>
                      <Td align="right" numeric>
                        {formatMoney(row.marketValue)}
                      </Td>
                      <Td align="right" numeric>
                        {formatMoney(row.buyoutClause)}
                      </Td>
                      <Td align="right">
                        <ClauseRatio ratio={row.clauseRatio} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Section>
    </Page>
  );
}

/** Los distintivos de una fila: corregido a mano, lesionado, sancionado. */
function Marcas({
  row,
}: {
  row: { overriddenFields: string[]; status: string };
}) {
  return (
    <>
      {row.overriddenFields.length > 0 && (
        <span title={`Corregido a mano: ${row.overriddenFields.join(", ")}`}>
          <Badge tone="warn">manual</Badge>
        </span>
      )}
      {row.status !== "ok" && (
        <Badge tone={row.status === "injured" ? "bad" : "warn"}>
          {row.status}
        </Badge>
      )}
    </>
  );
}

function estadoLegible(status: string): string {
  return (
    { ok: "Correcta", failed: "Con error", running: "En curso" }[status] ??
    status
  );
}

function ClauseRatio({ ratio }: { ratio: number | null }) {
  if (ratio === null) {
    return <span className="text-[11px] text-faint">sin cláusula</span>;
  }

  // Solo un aviso visual: decidir si blindar necesita además la caja de los
  // rivales y a quién le interesa el jugador, que es lo que hay en /riesgo.
  const tone = ratio < 1 ? "bad" : ratio < 1.5 ? "warn" : "muted";

  return (
    <Figure tone={tone} className="text-[12px]">
      {ratio.toFixed(2)}
      <span className="unit">×</span>
    </Figure>
  );
}
