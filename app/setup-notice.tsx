/**
 * Pantalla de primer arranque. La app depende de una base de datos y de un
 * login que solo el dueño puede hacer, así que cuando falta algo se dice
 * exactamente qué y cómo arreglarlo, en vez de enseñar una traza.
 */
export function SetupNotice({ message }: { message: string }) {
  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Fantasy Advisor</h1>
        <p className="text-sm text-neutral-500">Falta configuración</p>
      </header>

      <pre className="overflow-x-auto rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        {message}
      </pre>

      <p className="text-sm">
        Todo lo que falta se hace desde{" "}
        <a className="font-medium underline" href="/setup">
          /setup
        </a>
        : comprobar la configuración, iniciar sesión y traer los primeros
        datos. No hace falta terminal.
      </p>

      <h2 className="text-sm font-semibold">Con terminal</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Copia <code>.env.example</code> a <code>.env</code> y rellena{" "}
          <code>DATABASE_URL</code> y <code>TOKEN_ENCRYPTION_KEY</code>.
        </li>
        <li>
          Crea las tablas: <code>npm run db:deploy</code>
        </li>
        <li>
          Confirma que las rutas son de solo lectura:{" "}
          <code>npm run sync -- --offline</code>
        </li>
        <li>
          Inicia sesión una vez: <code>npm run sync -- --login</code>
        </li>
        <li>
          Primera lectura sin escribir nada:{" "}
          <code>npm run sync -- --dry-run --shape</code>
        </li>
        <li>
          Sincroniza de verdad: <code>npm run sync</code>
        </li>
      </ol>

      <p className="text-sm text-neutral-500">
        Las reglas del juego pendientes de confirmar están en{" "}
        <code>docs/reglas.md</code>. Ninguna se ha dado por supuesta en el
        código.
      </p>
    </main>
  );
}
