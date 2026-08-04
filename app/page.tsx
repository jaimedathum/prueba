import { getDashboardData, formatMoney } from "@/lib/queries";
import { SetupNotice } from "./setup-notice";
import { Badge, Card, Empty, Page, Section, Stat, StatGrid } from "./ui";

export const dynamic = "force-dynamic";

/**
 * Plantilla propia y estado de la ingesta.
 *
 * Es la pantalla de comprobación: sirve para verificar jugador a jugador que
 * lo sincronizado coincide con la app oficial. Por eso enseña la cláusula y su
 * ratio, que es lo que no se ve cómodamente en el juego.
 *
 * En móvil los jugadores van en tarjetas y no en tabla: seis columnas en 375px
 * obligan a desplazar en horizontal para leer una fila, que es justo lo que
 * hace inservible una tabla en el bolsillo.
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

  return (
    <Page
      title={me ? me.teamName : "Equipo sin identificar"}
      subtitle={
        me?.reportedBalance != null
          ? `Saldo ${formatMoney(me.reportedBalance)}`
          : "Saldo no disponible todavía"
      }
    >
      <Card>
        <StatGrid>
          <Stat label="Jugadores" value={squad.length} />
          <Stat
            label="Cláusula por debajo del valor"
            value={enRiesgo}
            tone={enRiesgo > 0 ? "warn" : "good"}
            hint={enRiesgo > 0 ? "salen baratos a un rival" : "ninguno barato"}
          />
          <Stat
            label="Última sincronización"
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
                ? lastSync.startedAt.toLocaleDateString("es-ES")
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
          <p className="mt-3 text-sm" style={{ color: "var(--bad)" }}>
            {lastSync.error}
          </p>
        )}
      </Card>

      <Section
        title={`Mi plantilla (${squad.length})`}
        hint="El ratio es cláusula ÷ valor. Por debajo de 1, el jugador le sale barato a un rival."
      >
        {squad.length === 0 ? (
          <Empty>
            Sin jugadores todavía. Comprueba en{" "}
            <a className="underline" href="/setup">
              la puesta en marcha
            </a>{" "}
            que la sincronización ha identificado tu equipo dentro de la liga.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {squad.map((row) => (
              <li key={row.playerId}>
                <Card className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{row.name}</span>
                      {row.overriddenFields.length > 0 && (
                        <span
                          title={`Corregido a mano: ${row.overriddenFields.join(", ")}`}
                        >
                          <Badge tone="warn">manual</Badge>
                        </span>
                      )}
                      {row.status !== "ok" && (
                        <Badge tone={row.status === "injured" ? "bad" : "warn"}>
                          {row.status}
                        </Badge>
                      )}
                    </div>
                    <div
                      className="mt-0.5 text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      {row.position} · valor {formatMoney(row.marketValue)}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="nums text-sm font-medium">
                      {formatMoney(row.buyoutClause)}
                    </div>
                    <div className="text-xs">
                      <ClauseRatio ratio={row.clauseRatio} />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
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
    return <span style={{ color: "var(--muted)" }}>sin cláusula</span>;
  }

  // Solo un aviso visual: decidir si blindar necesita además la caja de los
  // rivales y a quién le interesa el jugador, que es lo que hay en /riesgo.
  const tone =
    ratio < 1 ? "var(--bad)" : ratio < 1.5 ? "var(--warn)" : "var(--muted)";

  return (
    <span className="nums" style={{ color: tone }}>
      {ratio.toFixed(2)}× cláusula
    </span>
  );
}
