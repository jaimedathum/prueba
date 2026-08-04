import { getMarketDashboard } from "@/lib/engine/market-load";
import { bidForProbability } from "@/lib/engine/auction";
import { formatMoney } from "@/lib/queries";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";
import { Card, Empty, Notice, Page, RiskBar, Section, Stat, StatGrid } from "../ui";

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
      <Page title="Mercado">
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

  const especulativos = data.candidates.filter(
    (c) => c.speculation.verdict === "buy",
  );
  const pujables = data.candidates.filter((c) => c.auction.optimalBid !== null);

  return (
    <Page
      title="Mercado"
      subtitle="Qué mover, cuánto pujar y qué comprar solo para revender."
    >
      <Card>
        <StatGrid>
          <Stat label="Caja" value={formatMoney(data.myCash)} />
          <Stat
            label="Coste real del euro"
            value={`${data.cashCostMultiplier.toFixed(2)}€`}
            hint="lo que renuncias por gastarlo"
          />
          <Stat
            label="Precio de un punto"
            value={data.euroPerPoint ? formatMoney(data.euroPerPoint) : "—"}
            hint={data.euroPerPoint ? undefined : "sin jornadas jugadas"}
            tone={data.euroPerPoint ? undefined : "muted"}
          />
          <Stat label="En el mercado" value={data.candidates.length} />
        </StatGrid>
      </Card>

      {data.warnings.length > 0 ? (
        <Notice title="Lo que hay que tener en cuenta">
          <ul className="list-disc space-y-1 pl-5">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {/* --- Movimientos ------------------------------------------- */}
      <Section title="Movimiento recomendado">
        <Card>
          <p className="text-sm">{data.transfers.best.explanation}</p>
        </Card>
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
      </Section>

      {/* --- Pujas -------------------------------------------------- */}
      <Section
        title="Cuánto pujar"
        hint="La puja óptima maximiza el excedente esperado, no la probabilidad de ganar."
      >
        {pujables.length === 0 ? (
          <Empty>
            Ningún jugador sale rentable ahora mismo. Despliega la lista de
            abajo para ver el motivo de cada uno.
          </Empty>
        ) : (
          <ul className="space-y-3">
            {pujables.slice(0, 8).map((candidate) => {
              const para80 = bidForProbability(candidate.auction, 0.8);
              return (
                <li key={candidate.playerId}>
                  <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-sm">
                      {candidate.name}{" "}
                      <span className="font-normal" style={{ color: "var(--muted)" }}>
                        {positionCode(candidate.positionId)} ·{" "}
                        {formatMoney(candidate.marketValue)}
                      </span>
                    </strong>
                    <span className="nums font-semibold" style={{ color: "var(--accent)" }}>
                      {formatMoney(candidate.auction.optimalBid!)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
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
                  </Card>
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
                <li key={candidate.playerId}>
                  <Card className="space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <strong className="text-sm">
                        {candidate.name}{" "}
                        <span className="font-normal" style={{ color: "var(--muted)" }}>
                          {positionCode(candidate.positionId)} ·{" "}
                          {formatMoney(candidate.marketValue)}
                        </span>
                      </strong>
                      <span className="nums text-xs" style={{ color: "var(--muted)" }}>
                        {candidate.auction.optimalBid !== null
                          ? `pujar ${formatMoney(candidate.auction.optimalBid)}`
                          : "no pujar"}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <RiskBar
                        label="Perder dinero"
                        score={candidate.economicRisk.score}
                        caption={candidate.economicRisk.label}
                        confident={candidate.economicRisk.confident}
                      />
                      <RiskBar
                        label="No puntuar"
                        score={candidate.sportingRisk.score}
                        caption={candidate.sportingRisk.label}
                        confident={candidate.sportingRisk.confident}
                      />
                    </div>

                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {candidate.reason}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </details>
        )}

        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs" style={{ color: "var(--muted)" }}>
          <li>Puja pronto: en caso de empate gana la puja realizada antes.</li>
          <li>
            Puja una cifra no redonda: un euro por encima de un número
            psicológico redondo gana muchos empates.
          </li>
        </ul>
      </Section>

      {/* --- Especulación -------------------------------------------- */}
      <Section
        title="Comprar para revender"
        hint="Jugadores que no vas a alinear, solo porque su precio va a subir."
      >
        {!data.priceModelUsable ? (
          <Empty>
            El modelo de precios todavía no es fiable, así que no se recomienda
            especular con dinero real. Sigue sincronizando: cada día son más
            datos y este apartado se activa solo.
          </Empty>
        ) : especulativos.length === 0 ? (
          <Empty>
            Ningún jugador del mercado tiene margen suficiente para especular
            con él.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {especulativos.map((candidate) => (
              <li key={candidate.playerId}>
                <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm">{candidate.name}</strong>
                  <span className="tabular-nums">
                    hasta {formatMoney(candidate.speculation.maxPrice!)}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  {candidate.speculation.reason}
                </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.validation ? (
        <footer className="border-t pt-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
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
    </Page>
  );
}
