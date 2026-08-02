import { getDashboardData, formatMoney } from "@/lib/queries";
import { SetupNotice } from "./setup-notice";

export const dynamic = "force-dynamic";

/**
 * Panel mínimo de la fase 0: estado de la sincronización y plantilla propia.
 *
 * La interfaz de verdad llega con los motores (fases 1-3). Lo que importa
 * ahora es poder verificar, jugador a jugador, que lo sincronizado coincide con
 * la app oficial: es el test de aceptación de toda la ingesta.
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

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Fantasy Advisor</h1>
        <p className="text-sm text-neutral-500">
          {me ? me.teamName : "Equipo sin identificar"}
          {me?.reportedBalance !== null && me !== null
            ? ` · saldo ${formatMoney(me.reportedBalance)}`
            : ""}
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Última sincronización
        </h2>
        {lastSync ? (
          <div className="space-y-1 text-sm">
            <p>
              <StatusBadge status={lastSync.status} />{" "}
              <time dateTime={lastSync.startedAt.toISOString()}>
                {lastSync.startedAt.toLocaleString("es-ES")}
              </time>
            </p>
            {lastSync.error ? (
              <p className="text-red-600 dark:text-red-400">{lastSync.error}</p>
            ) : null}
            {lastSync.stats ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                {Object.entries(lastSync.stats).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt className="text-neutral-500">{key}</dt>
                    <dd className="tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            Todavía no se ha ejecutado ninguna sincronización. Lanza{" "}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              npm run sync
            </code>
            .
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Mi plantilla ({squad.length})
        </h2>

        {squad.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Sin datos todavía. Comprueba que la sincronización ha identificado
            tu equipo dentro de la liga.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
                  <th className="py-2 pr-3">Jugador</th>
                  <th className="py-2 pr-3">Pos</th>
                  <th className="py-2 pr-3 text-right">Valor</th>
                  <th className="py-2 pr-3 text-right">Cláusula</th>
                  <th className="py-2 pr-3 text-right">Ratio</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {squad.map((row) => (
                  <tr
                    key={row.playerId}
                    className="border-b border-neutral-100 dark:border-neutral-900"
                  >
                    <td className="py-2 pr-3">
                      {row.name}
                      {row.overriddenFields.length > 0 ? (
                        <span
                          className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                          title={`Corregido a mano: ${row.overriddenFields.join(", ")}`}
                        >
                          manual
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-neutral-500">{row.position}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatMoney(row.marketValue)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatMoney(row.buyoutClause)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <ClauseRatio ratio={row.clauseRatio} />
                    </td>
                    <td className="py-2 text-neutral-500">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-neutral-500">
          El ratio es cláusula ÷ valor. Por debajo de 1 el jugador sale barato
          para un rival. El radar de riesgo real —quién tiene caja para pagarla
          y a quién le interesa— llega en la fase 1.
        </p>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ok: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${styles[status] ?? "bg-neutral-100 dark:bg-neutral-800"}`}
    >
      {status}
    </span>
  );
}

function ClauseRatio({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <span className="text-neutral-400">—</span>;
  // Solo un aviso visual: la decisión de blindar necesita la caja de los
  // rivales y el coste real del blindaje, que son fase 1.
  const tone =
    ratio < 1
      ? "text-red-600 dark:text-red-400"
      : ratio < 1.5
        ? "text-amber-600 dark:text-amber-400"
        : "text-neutral-500";
  return <span className={tone}>{ratio.toFixed(2)}×</span>;
}
