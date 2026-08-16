/**
 * Qué proveedores de identidad hay configurados.
 *
 * Vive aparte de `lib/auth.ts` a propósito, y por dos razones que apuntan al
 * mismo sitio: el `middleware` corre en el runtime de borde y no puede
 * arrastrar Auth.js ni la base de datos, y esta comprobación es lo único de
 * toda la autenticación que se puede probar sin levantar nada.
 *
 * Antes estaba escrita dos veces —aquí y en línea en el middleware— y dos
 * copias de la regla que decide si la app está abierta o cerrada es
 * exactamente la clase de duplicación que acaba en un despliegue sin puerta.
 */

export interface ConfiguredProviders {
  google: boolean;
  email: boolean;
}

export function configuredProviders(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguredProviders {
  return {
    google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
    // Un enlace de acceso necesita servidor de salida Y remitente: con solo
    // uno de los dos, el envío falla en el momento de usarlo.
    email: Boolean(env.EMAIL_SERVER && env.EMAIL_FROM),
  };
}

/**
 * Sin ningún proveedor, el login no está encendido y la app sigue
 * comportándose como el despliegue de un solo dueño. Es lo que permite añadir
 * la autenticación sin dejar inaccesible lo que ya funciona.
 */
export function authEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.values(configuredProviders(env)).some(Boolean);
}
