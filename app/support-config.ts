/**
 * Cómo se sostiene el proyecto.
 *
 * La app es gratis y no tiene cuentas, así que lo único que puede pagarla
 * son donaciones y, como mucho, un patrocinio de texto. Todo eso se
 * configura por entorno para que quien despliegue esto ponga sus enlaces
 * sin tocar una línea de interfaz.
 *
 * Va en un módulo aparte de los componentes a propósito: la navegación es
 * cliente y necesita `DONATE_URL`; si lo importara del fichero que además
 * exporta la banda del pie, se arrastraría esa al paquete del navegador
 * para nada.
 *
 * Las variables se leen literalmente y no por destructuring porque es la
 * única forma en que Next las sustituye en el paquete de cliente.
 */

function limpio(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Quien lo escribe y lo mantiene. Va firmado: esto no es de una empresa. */
export const GITHUB_USER = "JLS97";
export const GITHUB_URL = `https://github.com/${GITHUB_USER}`;

/** Adónde va quien quiera invitar a un café. Sin ella no se enseña el botón. */
export const DONATE_URL = limpio(process.env.NEXT_PUBLIC_DONATE_URL);

/**
 * A quién escribe quien quiera anunciarse. Puede ser un mailto o una URL, y
 * si no se configura ninguna se cae al perfil de GitHub: un hueco ofrecido
 * al que no se puede contestar no sirve de nada.
 */
export const SPONSOR_CONTACT =
  limpio(process.env.NEXT_PUBLIC_SPONSOR_CONTACT) ?? GITHUB_URL;

export interface Sponsor {
  name: string;
  claim: string | null;
  url: string | null;
}

/**
 * El patrocinador actual, si lo hay. Es texto y un enlace, nunca un script
 * de terceros: la app no carga nada que pueda rastrear a quien la usa, y un
 * anuncio no va a ser la excepción.
 */
export const SPONSOR: Sponsor | null = limpio(process.env.NEXT_PUBLIC_SPONSOR_NAME)
  ? {
      name: process.env.NEXT_PUBLIC_SPONSOR_NAME!.trim(),
      claim: limpio(process.env.NEXT_PUBLIC_SPONSOR_CLAIM),
      url: limpio(process.env.NEXT_PUBLIC_SPONSOR_URL),
    }
  : null;
