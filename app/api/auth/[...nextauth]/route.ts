import { handlers } from "@/lib/auth";

/**
 * Rutas de Auth.js. Es la única entrada de `/api/auth/*`, y está fuera del
 * middleware: si el propio login exigiera sesión, no habría forma de entrar.
 */
export const { GET, POST } = handlers;
