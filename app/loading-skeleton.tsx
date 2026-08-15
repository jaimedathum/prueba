import { Panel, Skeleton } from "./ui";

/**
 * Lo que se ve mientras el servidor calcula.
 *
 * Todas estas pantallas son `force-dynamic` y detrás llevan motores que
 * resuelven alineaciones exactas o reconstruyen la caja de diez rivales
 * movimiento a movimiento: tardan. Un armazón con la forma real de lo que va
 * a llegar hace la espera más corta de lo que es, y sobre todo evita el salto
 * de layout cuando llega.
 */
export function PageSkeleton({
  rows = 6,
  stats = true,
}: {
  rows?: number;
  stats?: boolean;
}) {
  return (
    <div className="space-y-8" aria-busy role="status" aria-label="Cargando">
      <div className="space-y-2.5 border-b border-line pb-5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-full max-w-md" />
      </div>

      {stats && (
        <Panel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="space-y-3.5">
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      </div>
    </div>
  );
}
