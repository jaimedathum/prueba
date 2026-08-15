import { ButtonLink, Output } from "./ui";
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
    <main className="max-w-2xl space-y-8 pb-6">
      <header>
        <Mark size={32} />
        <h1 className="display mt-4">Falta configuración</h1>
        <p className="rule-heavy mt-5 max-w-xl pt-3 text-[13.5px] leading-relaxed text-muted">
          La app no ha podido leer sus datos. Abajo está el motivo exacto, y
          debajo lo que hay que hacer para arreglarlo.
        </p>
      </header>

      <Output tone="bad">{message}</Output>

      <section className="rule-heavy space-y-3 pt-3">
        <h2 className="slug">Sin terminal, recomendado</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Todo lo que falta se hace desde el navegador: comprobar la
          configuración, iniciar sesión y traer los primeros datos.
        </p>
        <ButtonLink href="/setup" variant="primary">
          Ir a la puesta en marcha
        </ButtonLink>
      </section>

      <section className="rule-heavy pt-3">
        <h2 className="slug mb-3">Con terminal</h2>
        <ol className="border-t border-line">
          {PASOS.map((paso, index) => (
            <li
              key={paso.cmd}
              className="flex gap-4 border-b border-line py-2.5 text-[13px] leading-relaxed text-muted"
            >
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

      <p className="rule pt-4 text-[12px] leading-relaxed text-faint">
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
