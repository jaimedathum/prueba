import { resolveTenant } from "@/lib/tenant";
import { getLineupDashboard } from "@/lib/engine/lineup-load";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";
import {
  Disclosure,
  Empty,
  Figure,
  Lede,
  ModelWarnings,
  Page,
  Row,
  Section,
  Table,
  Td,
  Th,
} from "../ui";
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
    data = await getLineupDashboard(await resolveTenant());
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (!data) {
    return (
      <Page eyebrow="Mi equipo" title="Alineación">
        <Empty>
          Todavía no se ha identificado tu equipo dentro de la liga. Pulsa
          Sincronizar arriba, y si sigue igual mira los avisos en{" "}
          <a className="underline underline-offset-2" href="/setup">
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
      eyebrow="Mi equipo"
      title="Alineación"
      subtitle="El once se resuelve exacto: se enumeran todas las formaciones legales y dentro de cada una se asigna por flujo de coste mínimo. No es una heurística."
      meta={[
        { label: "Jornada", value: nextMatchday ?? "—" },
        { label: "Dibujo", value: lineup?.formation.name ?? "—" },
        {
          label: "Partidos del modelo",
          value: `${model.matches}${model.converged ? "" : " ⚠"}`,
        },
      ]}
    >
      {!lineup ? (
        <Empty>
          No hay jugadores suficientes para formar un once con las formaciones
          disponibles.
        </Empty>
      ) : (
        <>
          <Section
            title="Once óptimo"
            aside={lineup.formation.name}
            hint="En el campo, el número es lo que se espera que puntúe cada uno. El color avisa de quién puede dejarte a cero: tiza va bien, ámbar es dudoso y rojo es probable que no juegue."
          >
            <div className="grid gap-7 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-10">
              <Pitch players={lineup.starters} />

              <div className="space-y-7">
                <div className="flex flex-wrap items-start gap-x-12 gap-y-6">
                  <Lede
                    label="Puntos esperados"
                    value={lineup.expectedPoints.toFixed(1)}
                    hint="Suma de los once titulares con el dibujo elegido."
                    accent
                  />
                  <Lede
                    label="Se espera que no jueguen"
                    value={lineup.expectedMissing.toFixed(1)}
                    hint="De los once. Por encima de dos, conviene mirar el banquillo antes de cerrar."
                  />
                </div>

                <div>
                  <p className="eyebrow rule border-b border-line py-2">
                    Qué cuesta cambiar de dibujo
                  </p>
                  <ul>
                    {lineup.alternatives.map((alternative) => {
                      const optima = alternative.cost <= 0;
                      return (
                        <Row key={alternative.formation}>
                          <span
                            className={`text-[13px] ${optima ? "font-semibold" : ""}`}
                          >
                            {alternative.formation}
                          </span>
                          <span className="flex items-baseline gap-3">
                            <Figure className="text-[12px]">
                              {alternative.expectedPoints.toFixed(1)}
                            </Figure>
                            <span
                              className="w-16 text-right font-mono text-[10px] uppercase tracking-[0.1em]"
                              style={{
                                color: optima
                                  ? "var(--color-ink)"
                                  : "var(--color-faint)",
                              }}
                            >
                              {optima
                                ? "óptima"
                                : `−${alternative.cost.toFixed(1)}`}
                            </span>
                          </span>
                        </Row>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            <Disclosure summary="Ver el detalle de los once, con el motivo de cada uno">
              <Table>
                <thead>
                  <tr>
                    <Th>Jugador</Th>
                    <Th>Pos</Th>
                    <Th align="right">Puntos</Th>
                    <Th align="right">Riesgo de 0</Th>
                    <Th>Por qué</Th>
                  </tr>
                </thead>
                <tbody>
                  {lineup.starters.map((player) => (
                    <tr key={player.playerId}>
                      <Td className="whitespace-nowrap font-medium">
                        {player.name}
                      </Td>
                      <Td className="font-mono text-[11px] uppercase text-faint">
                        {positionCode(player.positionId)}
                      </Td>
                      <Td align="right" numeric>
                        {player.expectedPoints.toFixed(1)}
                      </Td>
                      <Td align="right">
                        <RiskCell risk={player.riskOfZero} />
                      </Td>
                      <Td className="min-w-[18rem] text-[12px] leading-relaxed text-muted">
                        {explanations.get(player.playerId)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Disclosure>
          </Section>

          <Section
            title="Banquillo"
            aside={`${lineup.bench.length} fuera`}
            hint="Ordenados por lo que aportarían si entraran. El primero es tu recambio real."
          >
            <ul className="border-t border-line sm:columns-2 sm:gap-10">
              {lineup.bench.map((player) => (
                <Row key={player.playerId} className="break-inside-avoid">
                  <span className="min-w-0 truncate text-[13px]">
                    {player.name}{" "}
                    <span className="font-mono text-[11px] uppercase text-faint">
                      {positionCode(player.positionId)}
                    </span>
                  </span>
                  <Figure className="text-[12px]">
                    {player.expectedPoints.toFixed(1)}
                    <span className="unit"> pts</span>
                  </Figure>
                </Row>
              ))}
            </ul>
          </Section>
        </>
      )}

      <footer className="rule space-y-2 pt-4 text-[12px] leading-relaxed text-faint">
        <p>
          Ventaja de jugar en casa estimada: ×
          {Math.exp(model.homeAdvantage).toFixed(2)} en goles esperados.
          Corrección de marcadores bajos ρ = {model.rho.toFixed(3)}.
        </p>
        <ModelWarnings warnings={warnings} />
      </footer>
    </Page>
  );
}

function RiskCell({ risk }: { risk: number }) {
  const tone = risk > 0.5 ? "bad" : risk > 0.2 ? "warn" : "muted";
  return (
    <Figure tone={tone} className="text-[12px]">
      {(risk * 100).toFixed(0)}
      <span className="unit">%</span>
    </Figure>
  );
}
