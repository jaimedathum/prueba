import { Skeleton } from "./ui";

/**
 * Lo que se ve mientras el servidor calcula.
 *
 * Todas estas pantallas son `force-dynamic` y detrás llevan motores que
 * resuelven alineaciones exactas o reconstruyen la caja de diez rivales
 * movimiento a movimiento: tardan. Un armazón con la forma real de lo que va
 * a llegar hace la espera más corta de lo que es, y sobre todo evita el salto
 * de layout cuando llega.
 */
export function PageSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="space-y-10" aria-busy role="status" aria-label="Cargando">
      <div>
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="mt-3 h-12 w-72 max-w-full" />
        <div className="rule-heavy mt-5 flex flex-wrap justify-between gap-6 pt-3">
          <Skeleton className="h-3.5 w-full max-w-md" />
          <div className="flex gap-8">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="mt-2 h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="rule-heavy flex justify-between pt-3">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <div className="mt-5 border-t border-line">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="border-b border-line py-3.5">
              <Skeleton className="h-3.5 w-48 max-w-full" />
              <Skeleton className="mt-2 h-2.5 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
