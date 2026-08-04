import { getMarketDashboard } from "@/lib/engine/market-load";
import { bidForProbability } from "@/lib/engine/auction";
import { formatMoney } from "@/lib/queries";
import { positionCode } from "@/lib/domain/positions";
import { riskDots, type RiskLevel } from "@/lib/domain/risk";
import { SetupNotice } from "../setup-notice";

export const dynamic = "force-dynamic";

/**
 * Fase 3: mercado.
 *
 * Tres decisiones distintas en una pantalla: qué mover, cuánto pujar, y qué
 * comprar solo para revender. Cada una con su número y con lo que la sostiene.
 */
export default async function MercadoPage() {
  let data;
  try {
    data = await getMarketDashboard();
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
        <h1 className="text-2xl font-semibold">Mercado</h1>
        <p className="text-sm text-neutral-500">
          Todavía no se ha identificado tu equipo. Ejecuta{" "}
          <code>npm run sync</code> primero.
        </p>
      </main>
    );
  }

  const especulativos = data.candidates.filter(
    (c) => c.speculation.verdict === "buy",
  );
  const pujables = data.candidates.filter((c) => c.auction.optimalBid !== null);

  return (
    <main className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Mercado</h1>
        <p className="text-sm text-neutral-500">
          Caja {formatMoney(data.myCash)} · cada euro te cuesta{" "}
          <strong>{data.cashCostMultiplier.toFixed(2)}€</strong>
          {data.euroPerPoint
            ? ` · un punto vale ${formatMoney(data.euroPerPoint)}`
            : ""}
        </p>
      </header>

      {data.warnings.length > 0 ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide">
            Lo que hay que tener en cuenta
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- Movimientos ------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Movimiento recomendado
        </h2>
        <p className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          {data.transfers.best.explanation}
        </p>
        {data.transfers.alternatives.length > 1 ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-neutral-500">
              Otras {data.transfers.alternatives.length - 1} combinaciones
              evaluadas ({data.transfers.evaluated} en total)
            </summary>
            <ul className="mt-2 space-y-1">
              {data.transfers.alternatives.slice(1).map((plan, index) => (
                <li key={index} className="text-neutral-600 dark:text-neutral-400">
                  {plan.explanation}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* --- Pujas -------------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Cuánto pujar
        </h2>

        {pujables.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Ningún jugador del mercado sale rentable ahora mismo. Abajo tienes
            todos con el motivo de cada uno.
          </p>
        ) : (
          <ul className="space-y-3">
            {pujables.slice(0, 8).map((candidate) => {
              const para80 = bidForProbability(candidate.auction, 0.8);
              return (
                <li
                  key={candidate.playerId}
                  className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong>
                      {candidate.name}{" "}
                      <span className="font-normal text-neutral-500">
                        {positionCode(candidate.positionId)} ·{" "}
                        {formatMoney(candidate.marketValue)}
                      </span>
                    </strong>
                    <span className="tabular-nums">
                      {formatMoney(candidate.auction.optimalBid!)}
                    </span>
                  </div>
                  <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                    {candidate.auction.reason}
                  </p>
                  {para80 &&
                  para80.bid > candidate.auction.optimalBid! * 1.01 ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      Por {formatMoney(para80.bid - candidate.auction.optimalBid!)}{" "}
                      más subes al{" "}
                      {(para80.probabilityOfWinning * 100).toFixed(0)}% de
                      ganarla.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {/* Todos, incluidos los descartados. Que un jugador desaparezca sin
            explicación no es una recomendación: es un silencio. */}
        {data.candidates.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-neutral-500">
              Ver los {data.candidates.length} del mercado con su motivo y su
              riesgo
            </summary>
            <ul className="mt-2 space-y-2">
              {data.candidates.map((candidate) => (
                <li
                  key={candidate.playerId}
                  className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong>
                      {candidate.name}{" "}
                      <span className="font-normal text-neutral-500">
                        {positionCode(candidate.positionId)} ·{" "}
                        {formatMoney(candidate.marketValue)}
                      </span>
                    </strong>
                    <span className="text-xs tabular-nums text-neutral-500">
                      {candidate.auction.optimalBid !== null
                        ? `pujar ${formatMoney(candidate.auction.optimalBid)}`
                        : "no pujar"}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <Riesgo etiqueta="Perder dinero" nivel={candidate.economicRisk} />
                    <Riesgo etiqueta="No puntuar" nivel={candidate.sportingRisk} />
                  </div>

                  <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                    {candidate.reason}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}

        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-neutral-500">
          <li>Puja pronto: en caso de empate gana la puja realizada antes.</li>
          <li>
            Puja una cifra no redonda: un euro por encima de un número
            psicológico redondo gana muchos empates.
          </li>
        </ul>
      </section>

      {/* --- Especulación -------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Comprar para revender
        </h2>

        {!data.priceModelUsable ? (
          <p className="text-sm text-neutral-500">
            El modelo de precios todavía no es fiable, así que no se recomienda
            especular con dinero real. Sigue sincronizando: cada día que pasa
            son más datos y este apartado se activa solo.
          </p>
        ) : especulativos.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Ningún jugador del mercado tiene margen suficiente para especular
            con él.
          </p>
        ) : (
          <ul className="space-y-2">
            {especulativos.map((candidate) => (
              <li
                key={candidate.playerId}
                className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>{candidate.name}</strong>
                  <span className="tabular-nums">
                    hasta {formatMoney(candidate.speculation.maxPrice!)}
                  </span>
                </div>
                <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                  {candidate.speculation.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.validation ? (
        <footer className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
          <p>
            Modelo de precios validado con separación temporal:{" "}
            {data.validation.trainSamples} muestras de entrenamiento,{" "}
            {data.validation.testSamples} de prueba.{" "}
            {data.validation.skill > 0
              ? `Bate a la línea base "mañana vale lo mismo que hoy" en un ${(data.validation.skill * 100).toFixed(1)}%.`
              : "NO bate a la línea base: no conviene fiarse de él todavía."}
          </p>
          <p className="mt-1">
            Cobertura del cuantil 90:{" "}
            {((data.validation.calibration.get(0.9) ?? 0) * 100).toFixed(0)}%
            (debería rondar el 90% si está bien calibrado).
          </p>
        </footer>
      ) : null}
    </main>
  );
}

/**
 * Indicador de riesgo de 1 a 6. La confianza se enseña, no se esconde: un
 * riesgo bajo calculado sin datos suficientes no vale lo mismo que uno
 * calculado con un modelo validado, y presentarlos igual engañaría.
 */
function Riesgo({ etiqueta, nivel }: { etiqueta: string; nivel: RiskLevel }) {
  return (
    <span
      className={nivel.confident ? "" : "opacity-60"}
      title={
        nivel.confident
          ? `${etiqueta}: riesgo ${nivel.label}`
          : `${etiqueta}: todavía sin datos suficientes para fiarse`
      }
    >
      <span className="text-neutral-500">{etiqueta}</span>{" "}
      <span className="tabular-nums">{riskDots(nivel.score)}</span>{" "}
      <span className="text-neutral-500">
        {nivel.score}/6 {nivel.label}
        {nivel.confident ? "" : " · sin datos suficientes"}
      </span>
    </span>
  );
}
