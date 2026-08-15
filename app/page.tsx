import { getDashboardData, formatMoney } from "@/lib/queries";
import { SetupNotice } from "./setup-notice";
import {
  Badge,
  Empty,
  Figure,
  Notice,
  Page,
  Row,
  Section,
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
 * El mismo listado se pinta de dos maneras. En móvil, una ficha por jugador:
 * seis columnas en 375px obligan a desplazar en horizontal para leer una fila,
 * que es justo lo que hace inservible una tabla en el bolsillo. A partir de
 * tablet, tabla de verdad, que es como se compara una plantilla entera de un
 * vistazo.
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
      subtitle="El ratio es cláusula ÷ valor. Por debajo de 1, el jugador le sale barato a un rival: pagarla le cuesta menos de lo que vale lo que se lleva."
      meta={[
        {
          label: "Saldo",
          value:
            me?.reportedBalance != null
              ? formatMoney(me.reportedBalance)
              : "sin dato",
        },
        { label: "Valor plantilla", value: formatMoney(valorTotal) },
        {
          label: "Última lectura",
          value: lastSync
            ? lastSync.startedAt.toLocaleString("es-ES", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "nunca",
        },
      ]}
    >
      {lastSync?.status === "failed" && (
        <Notice tone="bad" title="La última sincronización falló">
          {lastSync.error ?? "Sin detalle del error."}
        </Notice>
      )}

      {enRiesgo > 0 && (
        <Notice tone="warn" title={`${enRiesgo} por debajo de su valor`}>
          Esos jugadores le salen baratos a cualquiera que tenga caja. Lo que
          hay que hacer con cada uno está en{" "}
          <a className="underline underline-offset-2" href="/riesgo">
            riesgo y cláusulas
          </a>
          .
        </Notice>
      )}

      <Section title="Mi plantilla" aside={`${squad.length} jugadores`}>
        {squad.length === 0 ? (
          <Empty>
            Sin jugadores todavía. Comprueba en{" "}
            <a className="underline underline-offset-2" href="/setup">
              la puesta en marcha
            </a>{" "}
            que la sincronización ha identificado tu equipo dentro de la liga.
          </Empty>
        ) : (
          <>
            {/* Móvil: una ficha por jugador. */}
            <ul className="border-t border-line sm:hidden">
              {squad.map((row) => (
                <Row key={row.playerId} className="items-center">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium">
                        {row.name}
                      </span>
                      <Marcas row={row} />
                    </span>
                    <span className="eyebrow mt-1 block">
                      {row.position} · {formatMoney(row.marketValue)}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <Figure className="block text-[13px]">
                      {formatMoney(row.buyoutClause)}
                    </Figure>
                    <ClauseRatio ratio={row.clauseRatio} />
                  </span>
                </Row>
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
