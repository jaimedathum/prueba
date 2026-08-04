import { getLineupDashboard } from "@/lib/engine/lineup-load";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";

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
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Alineación</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Todavía no se ha identificado tu equipo. Ejecuta{" "}
          <code>npm run sync</code> primero.
        </p>
      </main>
    );
  }

  const { lineup, model, nextMatchday, warnings, explanations } = data;

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Alineación</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {nextMatchday ? `Jornada ${nextMatchday}` : "Sin jornada pendiente"} ·
          modelo ajustado con {model.matches} partidos
          {model.converged ? "" : " (insuficientes)"}
        </p>
      </header>

      {warnings.length > 0 ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide">
            Lo que falta y qué se pierde por ello
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {!lineup ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No hay jugadores suficientes para formar un once con las formaciones
          disponibles.
        </p>
      ) : (
        <>
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
                Once óptimo · {lineup.formation.name}
              </h2>
              <span className="text-sm nums">
                {lineup.expectedPoints.toFixed(1)} puntos esperados
              </span>
            </div>

            <div className="table-scroll">
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

            <p className="mt-3 text-xs text-neutral-500">
              Se espera que {lineup.expectedMissing.toFixed(1)} de los 11 no
              lleguen a jugar. El riesgo de cero es la probabilidad de que un
              jugador no salga: es lo que decide si merece la pena arriesgar.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Qué cuesta cambiar de formación
            </h2>
            <ul className="space-y-1 text-sm">
              {lineup.alternatives.map((alternative) => (
                <li
                  key={alternative.formation}
                  className="flex justify-between gap-4 border-b border-neutral-100 py-1 dark:border-neutral-900"
                >
                  <span>{alternative.formation}</span>
                  <span className="nums text-neutral-500">
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
                  className="flex justify-between gap-4 border-b border-neutral-100 py-1 dark:border-neutral-900"
                >
                  <span>
                    {player.name}{" "}
                    <span className="text-neutral-500">
                      {positionCode(player.positionId)}
                    </span>
                  </span>
                  <span className="nums text-neutral-500">
                    {player.expectedPoints.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <footer className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
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
    </main>
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
