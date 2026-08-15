import { getLineupDashboard } from "@/lib/engine/lineup-load";
import { positionCode } from "@/lib/domain/positions";
import { SetupNotice } from "../setup-notice";
import {
  Disclosure,
  Empty,
  Figure,
  Notice,
  Page,
  Panel,
  Row,
  Section,
  Stat,
  StatGrid,
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
      <Page eyebrow="Mi equipo" title="Alineación">
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

  const { lineup, model, nextMatchday, warnings, explanations } = data;

  return (
    <Page
      eyebrow="Mi equipo"
      title="Alineación"
      subtitle={
        <>
          {nextMatchday ? `Jornada ${nextMatchday}` : "Sin jornada pendiente"} ·
          modelo ajustado con {model.matches} partidos
          {model.converged ? "" : " (insuficientes)"}
        </>
      }
    >
      {warnings.length > 0 ? (
        <Notice title="Lo que falta y qué se pierde por ello">
          <ul className="list-disc space-y-1 pl-4 marker:text-faint">
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
          <Section
            title="Once óptimo"
            aside={lineup.formation.name}
            hint="En el campo, el número es lo que se espera que puntúe cada uno. El color avisa de quién puede dejarte a cero: tiza va bien, ámbar es dudoso y rojo es probable que no juegue."
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
              <Pitch players={lineup.starters} />

              <div className="space-y-4">
                <Panel>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                    <Stat
                      label="Puntos esperados"
                      value={lineup.expectedPoints.toFixed(1)}
                      hint="suma de los once"
                    />
                    <Stat label="Formación" value={lineup.formation.name} />
                    <Stat
                      label="No jugarán"
                      value={lineup.expectedMissing.toFixed(1)}
                      hint="de los once"
                      tone={lineup.expectedMissing >= 2 ? "warn" : "good"}
                    />
                    <Stat label="Jornada" value={nextMatchday ?? "—"} />
                  </div>
                </Panel>

                <Panel>
                  <p className="eyebrow mb-2.5">Qué cuesta cambiar de dibujo</p>
                  <ul>
                    {lineup.alternatives.map((alternative) => {
                      const optima = alternative.cost <= 0;
                      return (
                        <Row key={alternative.formation}>
                          <span
                            className={`text-[13px] ${optima ? "font-medium" : ""}`}
                          >
                            {alternative.formation}
                          </span>
                          <span className="flex items-baseline gap-2">
                            <Figure className="text-[12px]">
                              {alternative.expectedPoints.toFixed(1)}
                            </Figure>
                            <Figure
                              tone={optima ? "brand" : "muted"}
                              className="w-14 text-right text-[11px]"
                            >
                              {optima
                                ? "óptima"
                                : `−${alternative.cost.toFixed(1)}`}
                            </Figure>
                          </span>
                        </Row>
                      );
                    })}
                  </ul>
                </Panel>
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
                      <Td className="min-w-[16rem] text-[12px] leading-relaxed text-muted">
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
            <Panel>
              <ul>
                {lineup.bench.map((player) => (
                  <Row key={player.playerId}>
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
            </Panel>
          </Section>
        </>
      )}

      <footer className="space-y-1.5 border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
        <p>
          El once se resuelve exacto: se enumeran todas las formaciones legales
          y dentro de cada una se asigna por flujo de coste mínimo. No es una
          heurística.
        </p>
        <p>
          Ventaja de jugar en casa estimada: ×
          {Math.exp(model.homeAdvantage).toFixed(2)} en goles esperados.
          Corrección de marcadores bajos ρ = {model.rho.toFixed(3)}.
        </p>
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
