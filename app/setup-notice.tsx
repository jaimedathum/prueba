import { ButtonLink, Output, Panel } from "./ui";
import { Mark } from "./nav";

/**
 * Pantalla de primer arranque. La app depende de una base de datos y de un
 * login que solo el dueño puede hacer, así que cuando falta algo se dice
 * exactamente qué y cómo arreglarlo, en vez de enseñar una traza.
 *
 * Es la primera pantalla que ve alguien que despliega esto, y muchas veces la
 * única durante un rato: merece la pena que se lea como una guía y no como un
 * error.
 */
export function SetupNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-2xl space-y-7 py-4">
      <header className="space-y-3">
        <Mark size={38} />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">
            Falta configuración
          </h1>
          <p className="text-[13px] leading-relaxed text-muted">
            La app no ha podido leer sus datos. Abajo está el motivo exacto, y
            debajo lo que hay que hacer para arreglarlo.
          </p>
        </div>
      </header>

      <Output tone="warn">{message}</Output>

      <Panel className="space-y-3">
        <p className="eyebrow">Sin terminal, recomendado</p>
        <p className="text-[13px] leading-relaxed text-muted">
          Todo lo que falta se hace desde el navegador: comprobar la
          configuración, iniciar sesión y traer los primeros datos.
        </p>
        <ButtonLink href="/setup" variant="primary">
          Ir a la puesta en marcha
        </ButtonLink>
      </Panel>

      <section className="space-y-3">
        <h2 className="eyebrow">Con terminal</h2>
        <ol className="space-y-2.5 text-[13px] leading-relaxed text-muted">
          {PASOS.map((paso, index) => (
            <li key={paso.cmd} className="flex gap-3">
              <span className="nums shrink-0 font-mono text-[11px] text-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                {paso.que} <code>{paso.cmd}</code>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
        Las reglas del juego pendientes de confirmar están en{" "}
        <code>docs/reglas.md</code>. Ninguna se ha dado por supuesta en el
        código.
      </p>
    </main>
  );
}

const PASOS = [
  {
    que: "Copia .env.example a .env y rellena DATABASE_URL y TOKEN_ENCRYPTION_KEY.",
    cmd: "cp .env.example .env",
  },
  { que: "Crea las tablas:", cmd: "npm run db:deploy" },
  {
    que: "Confirma que las rutas son de solo lectura:",
    cmd: "npm run sync -- --offline",
  },
  { que: "Inicia sesión una vez:", cmd: "npm run sync -- --login" },
  {
    que: "Primera lectura sin escribir nada:",
    cmd: "npm run sync -- --dry-run --shape",
  },
  { que: "Sincroniza de verdad:", cmd: "npm run sync" },
];
