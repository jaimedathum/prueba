import { getRiskDashboard } from "@/lib/engine/load";
import { formatMoney } from "@/lib/queries";
import { SetupNotice } from "../setup-notice";

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
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Riesgo</h1>
        <p className="text-sm text-neutral-500">
          Todavía no se ha identificado tu equipo dentro de la liga. Ejecuta{" "}
          <code>npm run sync</code> primero.
        </p>
      </main>
    );
  }

  const rivals = [...data.bands.values()]
    .filter((band) => band.managerId !== data.myManagerId)
    .sort((a, b) => b.point - a.point);

  return (
    <main className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Riesgo y cláusulas</h1>
        <p className="text-sm text-neutral-500">
          Horizonte {data.horizonDays} días · {data.observedDays} días de
          histórico · tu caja {formatMoney(data.myCash)}
        </p>
      </header>

      {/* --- Calibración ------------------------------------------- */}
      <section
        className={`rounded-lg border p-4 text-sm ${
          data.calibration.applied
            ? "border-neutral-200 dark:border-neutral-800"
            : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
        }`}
      >
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Calibración
        </h2>
        <p>{data.calibration.note}</p>
        <p className="mt-1 text-xs text-neutral-500">
          Tu saldo es el único visible, así que es el patrón contra el que se
          mide el modelo. Si no clava el tuyo, no acierta el de nadie.
        </p>
      </section>

      {/* --- Caja de los rivales ------------------------------------ */}
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Caja estimada de los rivales
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
                <th className="py-2 pr-3">Manager</th>
                <th className="py-2 pr-3 text-right">Mínimo</th>
                <th className="py-2 pr-3 text-right">Estimado</th>
                <th className="py-2 pr-3 text-right">Máximo</th>
                <th className="py-2">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {rivals.map((band) => (
                <tr
                  key={band.managerId}
                  className="border-b border-neutral-100 dark:border-neutral-900"
                >
                  <td className="py-2 pr-3">
                    {data.managerNames.get(band.managerId) ?? band.managerId}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">
                    {formatMoney(band.min)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">
                    {formatMoney(band.point)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">
                    {formatMoney(band.max)}
                  </td>
                  <td className="py-2">
                    <Confidence level={band.confidence} />
                    {band.uncertainEvents > 0 ? (
                      <span
                        className="ml-2 text-xs text-neutral-500"
                        title={`${band.uncertainEvents} de ${band.totalEvents} eventos sin importe conocido`}
                      >
                        {band.uncertainEvents} sin importe
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          El mínimo es el número que importa para el riesgo: es lo que un rival
          puede pagar con seguridad. La anchura de la banda mide lo que no se
          sabe, no un margen de error inventado.
        </p>
      </section>

      {/* --- Blindaje ------------------------------------------------ */}
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Tu plantilla
        </h2>

        {data.shieldBlockedReason ? (
          <pre className="overflow-x-auto rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {data.shieldBlockedReason}
          </pre>
        ) : (
          <>
            {data.shieldPlan && data.shieldPlan.actions.length > 0 ? (
              <p className="mb-3 rounded border border-green-300 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-950">
                Plan: invertir{" "}
                <strong>{formatMoney(data.shieldPlan.totalInvestment)}</strong>{" "}
                en {data.shieldPlan.actions.length} blindaje
                {data.shieldPlan.actions.length > 1 ? "s" : ""}, beneficio
                esperado{" "}
                <strong>
                  {formatMoney(data.shieldPlan.totalExpectedGain)}
                </strong>
                .
              </p>
            ) : null}

            <ul className="space-y-2">
              {data.shields.map((shield) => (
                <li
                  key={shield.playerId}
                  className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong>{shield.name}</strong>
                    <span className="flex items-center gap-2">
                      <Verdict verdict={shield.verdict} />
                      <span className="tabular-nums text-neutral-500">
                        riesgo {(shield.currentRisk * 100).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                    {shield.reason}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* --- Clausulazos --------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Clausulazos
        </h2>
        <ul className="space-y-2">
          {data.attacks.map((attack) => (
            <li
              key={attack.playerId}
              className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong>{attack.name}</strong>
                <span className="flex items-center gap-2">
                  <AttackBadge verdict={attack.verdict} />
                  <span className="tabular-nums text-neutral-500">
                    {formatMoney(attack.clause)}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {attack.reason}
              </p>
              {attack.fundingHarm > 0 ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Le pondrías {formatMoney(attack.clause)} en la caja a{" "}
                  {data.managerNames.get(attack.ownerManagerId) ??
                    attack.ownerManagerId}
                  .
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
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
    </main>
  );
}

function Confidence({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    low: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  const labels = { high: "alta", medium: "media", low: "baja" };
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

function Verdict({ verdict }: { verdict: string }) {
  const map: Record<string, [string, string]> = {
    shield: [
      "blindar",
      "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    ],
    "let-them-take-him": [
      "que se lo lleven",
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    ],
    "no-need": ["sin riesgo", "bg-neutral-100 dark:bg-neutral-800"],
    "not-worth-it": [
      "no compensa",
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    ],
  };
  const [label, style] = map[verdict] ?? [verdict, "bg-neutral-100"];
  return <span className={`rounded px-2 py-0.5 text-xs ${style}`}>{label}</span>;
}

function AttackBadge({ verdict }: { verdict: string }) {
  const map: Record<string, [string, string]> = {
    attack: [
      "rentable",
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    ],
    "too-expensive": ["no compensa", "bg-neutral-100 dark:bg-neutral-800"],
    "no-cash": ["sin caja", "bg-neutral-100 dark:bg-neutral-800"],
    locked: ["bloqueada", "bg-neutral-100 dark:bg-neutral-800"],
  };
  const [label, style] = map[verdict] ?? [verdict, "bg-neutral-100"];
  return <span className={`rounded px-2 py-0.5 text-xs ${style}`}>{label}</span>;
}
