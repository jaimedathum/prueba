import { ButtonLink } from "./ui";
import { Mark } from "./nav";

/**
 * Página inexistente. Corta y con salida: aquí no hay nada que diagnosticar,
 * solo una dirección que no existe.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-6 py-16 text-center">
      <div className="flex justify-center">
        <Mark size={40} />
      </div>
      <div className="space-y-2">
        <p className="eyebrow">Error 404</p>
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">
          Esta página no existe
        </h1>
        <p className="text-[13px] leading-relaxed text-muted">
          O la dirección está mal escrita, o apuntaba a algo que ya no está.
        </p>
      </div>
      <div className="flex justify-center">
        <ButtonLink href="/" variant="primary">
          Volver a mi plantilla
        </ButtonLink>
      </div>
    </main>
  );
}
