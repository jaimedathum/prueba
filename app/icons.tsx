/**
 * Los pictogramas de la navegación.
 *
 * Están dibujados a mano y no traídos de una librería, y no es por
 * capricho: los juegos de iconos populares son todos trazo redondeado de
 * dos píxeles sobre rejilla de 24, y ese trazo es precisamente lo que
 * hace que todas las aplicaciones se parezcan entre sí. Aquí el papel
 * manda: **filete de cabo cuadrado y marca sólida**, sobre una rejilla
 * corta de 16, que es el mismo vocabulario con el que está compuesta la
 * página —reglas y marcas— reducido a diez milímetros.
 *
 * Cada uno dice lo que hay debajo, no la categoría abstracta: la hoja de
 * alineación, el campo con su dibujo, la etiqueta de precio, dos equipos
 * de frente, el triángulo de aviso, los mandos y la casilla marcada.
 */

interface IconProps {
  /** Lado en píxeles. 14 en la tira de escritorio, 17 en la de móvil. */
  size?: number;
}

function Glyph({
  size = 16,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
      // Nada de uniones redondeadas: en esta app ni las esquinas ni los
      // cabos de línea se redondean en ninguna parte.
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {children}
    </svg>
  );
}

/** Hoja de alineación: tres dorsales con su nombre al lado. */
export function PlantillaIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="1" y="2" width="3" height="3" />
      <rect x="6" y="2.6" width="9" height="1.8" />
      <rect x="1" y="6.5" width="3" height="3" />
      <rect x="6" y="7.1" width="9" height="1.8" />
      <rect x="1" y="11" width="3" height="3" />
      <rect x="6" y="11.6" width="9" height="1.8" />
    </Glyph>
  );
}

/** El campo con un dibujo encima: dos arriba y uno atrás. */
export function OnceIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect
        x="1.7"
        y="1.4"
        width="12.6"
        height="13.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M1.7 8h12.6" stroke="currentColor" strokeWidth="1.2" />
      <rect x="3.9" y="3.5" width="2.3" height="2.3" />
      <rect x="9.8" y="3.5" width="2.3" height="2.3" />
      <rect x="6.85" y="10.2" width="2.3" height="2.3" />
    </Glyph>
  );
}

/** Etiqueta de precio: lo que cuesta y lo que se puja. */
export function MercadoIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M8.7 1.5H14.5V7.3L7.3 14.5L1.5 8.7L8.7 1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect x="10.5" y="3.5" width="2.2" height="2.2" />
    </Glyph>
  );
}

/** Dos equipos de frente. El hueco del medio es el partido. */
export function RivalesIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M1.4 2.2 L6.7 8 L1.4 13.8 Z" />
      <path d="M14.6 2.2 L9.3 8 L14.6 13.8 Z" />
    </Glyph>
  );
}

/** El triángulo de aviso, que es lo que es una cláusula sin blindar. */
export function RiesgoIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M8 1.6 L15 14.4 H1 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect x="7.2" y="6.6" width="1.6" height="3.4" />
      <rect x="7.2" y="11" width="1.6" height="1.6" />
    </Glyph>
  );
}

/** Mandos: mover a mano lo que la API devuelve mal. */
export function CorreccionesIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M1 4.5h14M1 11.5h14" stroke="currentColor" strokeWidth="1.3" />
      <rect x="3.6" y="2.4" width="3" height="4.2" />
      <rect x="9.4" y="9.4" width="3" height="4.2" />
    </Glyph>
  );
}

/** La casilla marcada: la puesta en marcha es una lista que se completa. */
export function AjustesIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M4.4 8.1 L6.8 10.5 L11.6 5.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </Glyph>
  );
}

/** Para el enlace de apoyo: una taza, que es lo que se invita. */
export function ApoyoIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M2.2 5.5H11.4V11A2.6 2.6 0 0 1 8.8 13.6H4.8A2.6 2.6 0 0 1 2.2 11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M11.4 7.1H13.4A1.6 1.6 0 0 1 13.4 10.3H11.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect x="4.4" y="1.6" width="1.5" height="2.6" />
      <rect x="7.7" y="1.6" width="1.5" height="2.6" />
    </Glyph>
  );
}
