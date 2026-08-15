import { getRiskDashboard } from "@/lib/engine/load";
import { formatMoney } from "@/lib/queries";
import { SetupNotice } from "../setup-notice";
import {
  Badge,
  Empty,
  Figure,
  Lede,
  Notice,
  Output,
  Page,
  RangeBar,
  Section,
  Table,
  Td,
  Th,
  type Tone,
} from "../ui";

export const dynamic = "force-dynamic";

/**
 * Fase 1: caja de los rivales y radar de cláusulas.
 *
 * Es lo que ninguna web pública puede darte, porque ninguna conoce tu liga.
 * Todo lo incierto se enseña como tal: bandas en vez de cifras, y un aviso
 * explícito cuando falta una regla del juego por confirmar.
 */
export default async function RiesgoPage() {
  let data;
  try {
    data = await getRiskDashboard();
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (!data) {
    return (
      <Page eyebrow="Decidir" title="Riesgo y cláusulas">
        <Empty>
          Todavía no se ha identificado tu equipo dentro de la liga. Pulsa
          Sincronizar arriba, o ejecuta <code>npm run sync</code> si operas
          desde la terminal.
        </Empty>
      </Page>
    );
  }

  const rivals = [...data.bands.values()]
    .filter((band) => band.managerId !== data.myManagerId)
    .sort((a, b) => b.point - a.point);

  // Todas las bandas contra el mismo techo: si cada una se escalara sola,
  // comparar dos barras no significaría nada.
  const scale = Math.max(1, ...rivals.map((band) => band.max));
  const aBlindar = data.shields.filter((s) => s.verdict === "shield").length;
  const rentables = data.attacks.filter((a) => a.verdict === "attack").length;

  return (
    <Page
      eyebrow="Decidir"
      title="Riesgo y cláusulas"
      subtitle="Quién puede pagar qué, a quién te conviene blindar, y a quién te sale a cuenta clausular. El mínimo de cada banda es el número que importa para defenderse: es lo que un rival puede pagar con seguridad."
      meta={[
        { label: "Tu caja", value: formatMoney(data.myCash) },
        { label: "Horizonte", value: `${data.horizonDays} días` },
        { label: "Histórico", value: `${data.observedDays} días` },
      ]}
    >
      <div className="flex flex-wrap items-start gap-x-14 gap-y-6">
        <Lede
          label="Jugadores tuyos a blindar"
          value={aBlindar}
          hint="Los que pierdes más de lo que cuesta protegerlos."
          accent={aBlindar > 0}
        />
        <Lede
          label="Clausulazos rentables"
          value={rentables}
          hint="Contando ya lo que le pondrías en la caja a su dueño."
        />
      </div>

      <Notice
        tone={data.calibration.applied ? "good" : "neutral"}
        title="Calibración del modelo"
      >
        <p>{data.calibration.note}</p>
        <p className="mt-1.5 text-faint">
          Tu saldo es el único visible, así que es el patrón contra el que se
          mide el modelo. Si no clava el tuyo, no acierta el de nadie.
        </p>
      </Notice>

      {/* --- Caja de los rivales ------------------------------------ */}
      <Section
        title="Caja estimada de los rivales"
        aside={`${rivals.length} managers`}
        hint="La anchura de la banda mide lo que no se sabe, no un margen de error inventado."
      >
        {rivals.length === 0 ? (
          <Empty>
            Todavía no hay rivales con actividad suficiente para estimarles la
            caja.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Manager</Th>
                <Th className="w-full min-w-[9rem]">Banda</Th>
                <Th align="right">Mínimo</Th>
                <Th align="right">Estimado</Th>
                <Th align="right">Máximo</Th>
                <Th align="right">Confianza</Th>
              </tr>
            </thead>
            <tbody>
              {rivals.map((band) => (
                <tr key={band.managerId}>
                  <Td className="whitespace-nowrap font-medium">
                    {data.managerNames.get(band.managerId) ?? band.managerId}
                  </Td>
                  <Td className="min-w-[9rem]">
                    <RangeBar
                      min={band.min}
                      point={band.point}
                      max={band.max}
                      scaleMax={scale}
                      format={formatMoney}
                    />
                  </Td>
                  <Td align="right" numeric className="text-faint">
                    {formatMoney(band.min)}
                  </Td>
                  <Td align="right" numeric className="font-medium">
                    {formatMoney(band.point)}
                  </Td>
                  <Td align="right" numeric className="text-faint">
                    {formatMoney(band.max)}
                  </Td>
                  <Td align="right">
                    <span className="inline-flex flex-col items-end gap-1">
                      <Confidence level={band.confidence} />
                      {band.uncertainEvents > 0 ? (
                        <span
                          className="whitespace-nowrap font-mono text-[10px] text-faint"
                          title={`${band.uncertainEvents} de ${band.totalEvents} eventos sin importe conocido`}
                        >
                          {band.uncertainEvents} sin importe
                        </span>
                      ) : null}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* --- Blindaje ------------------------------------------------ */}
      <Section
        title="A quién blindar"
        aside={`${data.shields.length} evaluados`}
        hint="Blindar cuesta dinero seguro para evitar una pérdida probable. Solo compensa cuando lo segundo pesa más que lo primero."
      >
        {data.shieldBlockedReason ? (
          <Output>{data.shieldBlockedReason}</Output>
        ) : (
          <>
            {data.shieldPlan && data.shieldPlan.actions.length > 0 ? (
              <p className="max-w-3xl text-[17px] leading-snug sm:text-[19px]">
                Invertir{" "}
                <strong className="scoreline text-brand-ink">
                  {formatMoney(data.shieldPlan.totalInvestment)}
                </strong>{" "}
                en {data.shieldPlan.actions.length} blindaje
                {data.shieldPlan.actions.length > 1 ? "s" : ""} tiene un
                beneficio esperado de{" "}
                <strong className="scoreline">
                  {formatMoney(data.shieldPlan.totalExpectedGain)}
                </strong>
                .
              </p>
            ) : null}

            {data.shields.length === 0 ? (
              <Empty>
                Ningún jugador tuyo está expuesto lo suficiente para plantearse
                blindarlo.
              </Empty>
            ) : (
              <ul className="border-t border-line">
                {data.shields.map((shield) => (
                  <li
                    key={shield.playerId}
                    className="border-b border-line py-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <strong className="text-[15px] font-semibold">
                        {shield.name}
                      </strong>
                      <span className="flex items-center gap-2.5">
                        <Figure className="text-[12px] text-faint">
                          {(shield.currentRisk * 100).toFixed(1)}
                          <span className="unit">%</span>
                        </Figure>
                        <Verdict verdict={shield.verdict} />
                      </span>
                    </div>
                    <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
                      {shield.reason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      {/* --- Clausulazos --------------------------------------------- */}
      <Section
        title="A quién clausular"
        aside={`${rentables} de ${data.attacks.length} rentables`}
        hint="Pagar una cláusula también le pone ese dinero en la caja a su dueño. El veredicto ya lo tiene en cuenta."
      >
        {data.attacks.length === 0 ? (
          <Empty>
            No hay jugadores de rivales evaluables todavía: hace falta conocer
            sus cláusulas y su caja.
          </Empty>
        ) : (
          <ul className="border-t border-line">
            {data.attacks.map((attack) => (
              <li key={attack.playerId} className="border-b border-line py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-[15px] font-semibold">
                    {attack.name}
                  </strong>
                  <span className="flex items-center gap-2.5">
                    <Figure className="text-[12px]">
                      {formatMoney(attack.clause)}
                    </Figure>
                    <AttackBadge verdict={attack.verdict} />
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
                  {attack.reason}
                </p>
                {attack.fundingHarm > 0 ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    Le pondrías {formatMoney(attack.clause)} en la caja a{" "}
                    {data.managerNames.get(attack.ownerManagerId) ??
                      attack.ownerManagerId}
                    .
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <footer className="rule pt-4 text-[12px] leading-relaxed text-faint">
        <p>
          Valoración provisional: coste de reposición ={" "}
          {data.priors.bidTypical.toFixed(2)}× el valor de mercado, aprendido de{" "}
          {data.priors.samples} compras de tu liga
          {data.priors.samples < 8
            ? " (aún pocas: se están usando los valores de reserva)"
            : ""}
          . En la fase 2 pasa a ser puntos esperados.
        </p>
      </footer>
    </Page>
  );
}

function Confidence({ level }: { level: "high" | "medium" | "low" }) {
  const map: Record<typeof level, [string, Tone]> = {
    high: ["alta", "good"],
    medium: ["media", "warn"],
    low: ["baja", "bad"],
  };
  const [label, tone] = map[level];
  return <Badge tone={tone}>{label}</Badge>;
}

function Verdict({ verdict }: { verdict: string }) {
  const map: Record<string, [string, Tone]> = {
    shield: ["blindar", "bad"],
    "let-them-take-him": ["que se lo lleven", "good"],
    "no-need": ["sin riesgo", "muted"],
    "not-worth-it": ["no compensa", "muted"],
  };
  const [label, tone] = map[verdict] ?? [verdict, "muted"];
  return <Badge tone={tone}>{label}</Badge>;
}

function AttackBadge({ verdict }: { verdict: string }) {
  const map: Record<string, [string, Tone]> = {
    attack: ["rentable", "good"],
    "too-expensive": ["no compensa", "muted"],
    "no-cash": ["sin caja", "muted"],
    locked: ["bloqueada", "muted"],
  };
  const [label, tone] = map[verdict] ?? [verdict, "muted"];
  return <Badge tone={tone}>{label}</Badge>;
}
