import { getLineupDashboard } from "@/lib/engine/lineup-load";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";
import { Card, Empty, Notice, Page, Section, Stat, StatGrid } from "../ui";
import { Pitch } from "../pitch";

export const dynamic = "force-dynamic";

/**
 * Fase 2: el once óptimo de la jornada.
 *
 * Se enseña siempre de dónde sale cada número y qué se está dando por
 * supuesto. Un optimizador que escupe once nombres sin explicar por qué es
 * imposible de contrastar, y por tanto imposible de confiar.
 */
export default async function AlineacionPage() {
  let data;
  try {
    data = await getLineupDashboard();
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (!data) {
    return (
      <Page title="Alineación">
        <Empty>
          Todavía no se ha identificado tu equipo dentro de la liga. Pulsa
          Sincronizar arriba, y si sigue igual mira los avisos en{" "}
          <a className="underline" href="/setup">
            la puesta en marcha
          </a>
          .
        </Empty>
      </Page>
    );
  }

  const { lineup, model, nextMatchday, warnings, explanations } = data;

  return (
    <Page
      title="Alineación"
      subtitle={`${nextMatchday ? `Jornada ${nextMatchday}` : "Sin jornada pendiente"} · modelo ajustado con ${model.matches} partidos${model.converged ? "" : " (insuficientes)"}`}
    >
      {warnings.length > 0 ? (
        <Notice title="Lo que falta y qué se pierde por ello">
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {!lineup ? (
        <Empty>
          No hay jugadores suficientes para formar un once con las formaciones
          disponibles.
        </Empty>
      ) : (
        <>
          <Section title={`Once óptimo · ${lineup.formation.name}`}>
            <Pitch players={lineup.starters} />

            <Card>
              <StatGrid>
                <Stat
                  label="Puntos esperados"
                  value={lineup.expectedPoints.toFixed(1)}
                />
                <Stat label="Formación" value={lineup.formation.name} />
                <Stat
                  label="Se espera que no jueguen"
                  value={lineup.expectedMissing.toFixed(1)}
                  hint="de los 11"
                  tone={lineup.expectedMissing >= 2 ? "warn" : "good"}
                />
                <Stat label="Jornada" value={nextMatchday ?? "—"} />
              </StatGrid>
            </Card>

            <p className="text-xs" style={{ color: "var(--muted)" }}>
              En el campo, el número es lo que se espera que puntúe cada uno.
              El color avisa de quién puede dejarte a cero: blanco va bien,
              ámbar es dudoso y rojo es probable que no juegue.
            </p>

            <details>
              <summary className="cursor-pointer text-sm" style={{ color: "var(--muted)" }}>
                Ver el detalle de los once, con el motivo de cada uno
              </summary>
            <div className="table-scroll mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
                    <th className="py-2 pr-3">Jugador</th>
                    <th className="py-2 pr-3">Pos</th>
                    <th className="py-2 pr-3 text-right">EP</th>
                    <th className="py-2 pr-3 text-right">Riesgo de 0</th>
                    <th className="py-2">Por qué</th>
                  </tr>
                </thead>
                <tbody>
                  {lineup.starters.map((player) => (
                    <tr
                      key={player.playerId}
                      className="border-b border-neutral-100 align-top dark:border-neutral-900"
                    >
                      <td className="py-2 pr-3 font-medium">{player.name}</td>
                      <td className="py-2 pr-3 text-neutral-500">
                        {positionCode(player.positionId)}
                      </td>
                      <td className="py-2 pr-3 text-right nums">
                        {player.expectedPoints.toFixed(1)}
                      </td>
                      <td className="py-2 pr-3 text-right nums">
                        <RiskCell risk={player.riskOfZero} />
                      </td>
                      <td className="py-2 text-xs text-neutral-500">
                        {explanations.get(player.playerId)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </details>
          </Section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Qué cuesta cambiar de formación
            </h2>
            <ul className="space-y-1 text-sm">
              {lineup.alternatives.map((alternative) => (
                <li
                  key={alternative.formation}
                  className="flex justify-between gap-4 border-b py-1" style={{ borderColor: "var(--border)" }}
                >
                  <span>{alternative.formation}</span>
                  <span className="nums" style={{ color: "var(--muted)" }}>
                    {alternative.expectedPoints.toFixed(1)}
                    {alternative.cost > 0
                      ? ` (−${alternative.cost.toFixed(1)})`
                      : " ← óptima"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Banquillo
            </h2>
            <ul className="space-y-1 text-sm">
              {lineup.bench.map((player) => (
                <li
                  key={player.playerId}
                  className="flex justify-between gap-4 border-b py-1" style={{ borderColor: "var(--border)" }}
                >
                  <span>
                    {player.name}{" "}
                    <span style={{ color: "var(--muted)" }}>
                      {positionCode(player.positionId)}
                    </span>
                  </span>
                  <span className="nums" style={{ color: "var(--muted)" }}>
                    {player.expectedPoints.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <footer className="border-t pt-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <p>
          El once se resuelve exacto: se enumeran todas las formaciones legales
          y dentro de cada una se asigna por flujo de coste mínimo. No es una
          heurística.
        </p>
        <p className="mt-1">
          Ventaja de jugar en casa estimada: ×
          {Math.exp(model.homeAdvantage).toFixed(2)} en goles esperados.
          Corrección de marcadores bajos ρ = {model.rho.toFixed(3)}.
        </p>
      </footer>
    </Page>
  );
}

function RiskCell({ risk }: { risk: number }) {
  const tone =
    risk > 0.5
      ? "text-red-600 dark:text-red-400"
      : risk > 0.2
        ? "text-amber-600 dark:text-amber-400"
        : "text-neutral-500";
  return <span className={tone}>{(risk * 100).toFixed(0)}%</span>;
}
