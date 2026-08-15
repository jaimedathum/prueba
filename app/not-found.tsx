import { ButtonLink } from "./ui";
import { Mark } from "./nav";

/**
 * Página inexistente. Corta y con salida: aquí no hay nada que diagnosticar,
 * solo una dirección que no existe.
 */
export default function NotFound() {
  return (
    <main className="max-w-lg space-y-6 py-10">
      <Mark size={32} />
      <div>
        <p className="eyebrow">Error 404</p>
        <h1 className="display mt-2">Esta página no existe</h1>
      </div>
      <p className="rule-heavy pt-3 text-[13.5px] leading-relaxed text-muted">
        O la dirección está mal escrita, o apuntaba a algo que ya no está.
      </p>
      <ButtonLink href="/" variant="primary">
        Volver a mi plantilla
      </ButtonLink>
    </main>
  );
}
