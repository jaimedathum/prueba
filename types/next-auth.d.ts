import type { DefaultSession } from "next-auth";

/**
 * La sesión lleva el id de cuenta resuelto.
 *
 * Declararlo en el tipo, y no solo rellenarlo en el callback, es lo que hace
 * que olvidarse de scopear una consulta sea un error de compilación en vez de
 * una fuga de datos entre clientes.
 */
declare module "next-auth" {
  interface Session {
    accountId: string;
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
