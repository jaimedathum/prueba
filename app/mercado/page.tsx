import { getMarketDashboard } from "@/lib/engine/market-load";
import { bidForProbability } from "@/lib/engine/auction";
import { formatMoney } from "@/lib/queries";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";
import {
  Badge,
  Disclosure,
  Empty,
  Figure,
  Notice,
  Page,
  Panel,
  RiskBar,
  Section,
  Stat,
  StatGrid,
} from "../ui";

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
      <Page eyebrow="Decidir" title="Mercado">
        <Empty>
          Todavía no se ha identificado tu equipo dentro de la liga. Pulsa
          Sincronizar arriba, y si sigue igual mira los avisos en{" "}
          <a className="font-medium text-brand-ink underline" href="/setup">
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
      eyebrow="Decidir"
      title="Mercado y pujas"
      subtitle="Qué mover, cuánto pujar exactamente, y qué comprar solo para revenderlo más caro."
    >
      <Panel>
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
            hint={data.euroPerPoint ? "según tu liga" : "sin jornadas jugadas"}
            tone={data.euroPerPoint ? undefined : "muted"}
          />
          <Stat
            label="En el mercado"
            value={data.candidates.length}
            hint={`${pujables.length} salen rentables`}
          />
        </StatGrid>
      </Panel>

      {data.warnings.length > 0 ? (
        <Notice title="Lo que hay que tener en cuenta">
          <ul className="list-disc space-y-1 pl-4 marker:text-faint">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {/* --- Movimientos ------------------------------------------- */}
      <Section
        title="Movimiento recomendado"
        hint="La mejor combinación de compra y venta evaluada sobre toda tu plantilla."
      >
        <Panel tone="brand">
          <p className="text-[14px] leading-relaxed">
            {data.transfers.best.explanation}
          </p>
        </Panel>

        {data.transfers.alternatives.length > 1 ? (
          <Disclosure
            summary={`Otras ${data.transfers.alternatives.length - 1} combinaciones evaluadas, de ${data.transfers.evaluated} en total`}
          >
            <ul className="space-y-2">
              {data.transfers.alternatives.slice(1).map((plan, index) => (
                <li
                  key={index}
                  className="border-l border-line pl-3 text-[13px] leading-relaxed text-muted"
                >
                  {plan.explanation}
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </Section>

      {/* --- Pujas -------------------------------------------------- */}
      <Section
        title="Cuánto pujar"
        aside={`${pujables.length} rentables`}
        hint="La puja óptima maximiza el excedente esperado, no la probabilidad de ganar. Pujar más sube tus opciones y baja lo que te llevas cuando ganas."
      >
        {pujables.length === 0 ? (
          <Empty>
            Ningún jugador sale rentable ahora mismo. Despliega la lista de
            abajo para ver el motivo de cada uno: que no haya recomendación no
            significa que no haya análisis.
          </Empty>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {pujables.slice(0, 8).map((candidate) => {
              const para80 = bidForProbability(candidate.auction, 0.8);
              const subida =
                para80 && para80.bid > candidate.auction.optimalBid! * 1.01
                  ? para80
                  : null;

              return (
                <Panel key={candidate.playerId} as="li" className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                        {candidate.name}
                      </p>
                      <p className="eyebrow mt-1">
                        {positionCode(candidate.positionId)} ·{" "}
                        {formatMoney(candidate.marketValue)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="eyebrow">Pujar</p>
                      <p className="scoreline text-[19px] font-semibold leading-tight text-brand-ink">
                        {formatMoney(candidate.auction.optimalBid!)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[13px] leading-relaxed text-muted">
                    {candidate.auction.reason}
                  </p>

                  {subida ? (
                    <p className="mt-auto border-t border-line pt-2.5 text-[12px] leading-relaxed text-faint">
                      Por{" "}
                      <Figure tone="muted">
                        {formatMoney(subida.bid - candidate.auction.optimalBid!)}
                      </Figure>{" "}
                      más subes al{" "}
                      <Figure tone="muted">
                        {(subida.probabilityOfWinning * 100).toFixed(0)}%
                      </Figure>{" "}
                      de ganarla.
                    </p>
                  ) : null}
                </Panel>
              );
            })}
          </ul>
        )}

        {/* Todos, incluidos los descartados. Que un jugador desaparezca sin
            explicación no es una recomendación: es un silencio. */}
        {data.candidates.length > 0 && (
          <Disclosure
            summary={`Ver los ${data.candidates.length} del mercado con su motivo y su riesgo`}
          >
            <ul className="grid gap-3 lg:grid-cols-2">
              {data.candidates.map((candidate) => (
                <Panel key={candidate.playerId} as="li" className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <strong className="text-[14px] font-semibold">
                        {candidate.name}
                      </strong>{" "}
                      <span className="eyebrow">
                        {positionCode(candidate.positionId)} ·{" "}
                        {formatMoney(candidate.marketValue)}
                      </span>
                    </span>
                    {candidate.auction.optimalBid !== null ? (
                      <Badge tone="brand">
                        pujar {formatMoney(candidate.auction.optimalBid)}
                      </Badge>
                    ) : (
                      <Badge tone="muted">no pujar</Badge>
                    )}
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

                  <p className="text-[12px] leading-relaxed text-faint">
                    {candidate.reason}
                  </p>
                </Panel>
              ))}
            </ul>
          </Disclosure>
        )}

        <Panel>
          <p className="eyebrow mb-2">Dos reglas de la casa</p>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted">
            <li className="flex gap-2.5">
              <span aria-hidden className="text-brand-ink">
                ·
              </span>
              Puja pronto: en caso de empate gana la puja realizada antes.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="text-brand-ink">
                ·
              </span>
              Puja una cifra no redonda: un euro por encima de un número
              psicológico redondo gana muchos empates.
            </li>
          </ul>
        </Panel>
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
          <ul className="grid gap-3 lg:grid-cols-2">
            {especulativos.map((candidate) => (
              <Panel key={candidate.playerId} as="li">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-[14px] font-semibold">
                    {candidate.name}
                  </strong>
                  <span className="text-right">
                    <span className="eyebrow">Hasta</span>{" "}
                    <Figure tone="brand" className="text-[14px]">
                      {formatMoney(candidate.speculation.maxPrice!)}
                    </Figure>
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  {candidate.speculation.reason}
                </p>
              </Panel>
            ))}
          </ul>
        )}
      </Section>

      {data.validation ? (
        <footer className="space-y-1.5 border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
          <p>
            Modelo de precios validado con separación temporal:{" "}
            {data.validation.trainSamples} muestras de entrenamiento,{" "}
            {data.validation.testSamples} de prueba.{" "}
            {data.validation.skill > 0
              ? `Bate a la línea base "mañana vale lo mismo que hoy" en un ${(data.validation.skill * 100).toFixed(1)}%.`
              : "NO bate a la línea base: no conviene fiarse de él todavía."}
          </p>
          <p>
            Cobertura del cuantil 90:{" "}
            {((data.validation.calibration.get(0.9) ?? 0) * 100).toFixed(0)}%
            (debería rondar el 90% si está bien calibrado).
          </p>
        </footer>
      ) : null}
    </Page>
  );
}
