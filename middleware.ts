import { NextResponse, type NextRequest } from "next/server";
import { authEnabled } from "@/lib/auth-providers";

/**
 * La puerta de la aplicación.
 *
 * Hasta ahora no existía este fichero, y eso significaba exactamente lo que
 * parece: cualquiera con la URL del despliegue veía plantillas, cláusulas,
 * saldos estimados y recomendaciones. Con un solo dueño era un descuido; con
 * clientes de pago sería una fuga de datos ajenos.
 *
 * **Lista de lo abierto, no de lo cerrado.** Al revés —enumerar lo protegido—
 * cada pantalla nueva nace pública hasta que alguien se acuerda de añadirla, y
 * ese olvido no falla de forma ruidosa: falla enseñando datos.
 */

const PUBLIC_PREFIXES = [
  "/login",
  // Auth.js necesita sus propias rutas abiertas: si el login exigiera sesión,
  // no habría manera de iniciarla.
  "/api/auth",
  // Los crons no traen cookie: se autentican con `CRON_SECRET` en la
  // cabecera, y esa comprobación la hace cada ruta por su cuenta.
  "/api/cron",
  // La puesta en marcha es anterior a que exista ninguna cuenta, y va cerrada
  // con `CRON_SECRET` desde la fase 0.
  "/setup",
];

/**
 * Exportada para poder probarla: la lista de lo abierto es la superficie de
 * ataque entera de la aplicación, y comprobarla leyendo no vale. Ojo con el
 * `startsWith` a secas — sin la barra, `/setupfalso` colaría por `/setup`.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Se comprueba la **presencia** de la cookie de sesión, no su validez.
 *
 * Validarla exigiría consultar la base de datos en cada petición, y el
 * middleware corre en el runtime de borde donde no hay conexión. La
 * comprobación de verdad la hace cada página al resolver su cuenta: esto solo
 * evita que alguien sin sesión llegue a verlas. Una cookie inventada pasa de
 * aquí y se estrella contra la resolución de cuenta, que sí consulta.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some(
    (name) => request.cookies.get(name)?.value,
  );
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  // Para devolver a donde iba después de identificarse, en vez de soltarlo
  // en la portada y que tenga que volver a navegar.
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /**
     * Todo menos los estáticos de Next, el favicon y las fuentes. Se
     * enumeran aquí porque hacerlos pasar por el middleware solo añade
     * latencia a cada recurso sin proteger nada.
     */
    "/((?!_next/static|_next/image|favicon.ico|fonts/).*)",
  ],
};
