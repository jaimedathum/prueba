import { positionCode, type PositionCode } from "@/lib/domain/positions";

/**
 * El once sobre un campo.
 *
 * Una tabla de once filas es correcta pero no se lee como una alineación: no
 * se ve de un vistazo que la defensa está descubierta o que hay tres puntas.
 * Sobre el campo eso salta a la vista, que es justo lo que se quiere decidir
 * aquí.
 *
 * El campo va **en vertical**, con la portería propia abajo, porque es la
 * orientación natural del móvil y la que usa la app oficial. Cada línea se
 * reparte el ancho a partes iguales, así que sirve igual para un 5-3-2 que
 * para un 3-4-3 sin cálculos de posición a mano.
 *
 * El verde es propio y no un token del tema: el césped es césped en claro y
 * en oscuro, y una hierba que cambia de color con el sistema operativo sería
 * el tipo de coherencia que no le importa a nadie.
 *
 * El color de cada ficha es el **riesgo de no jugar**, no los puntos: entre
 * dos jugadores parecidos, lo que decide es quién puede dejarte a cero.
 */

export interface PitchPlayer {
  playerId: string;
  name: string;
  positionId: number;
  expectedPoints: number;
  riskOfZero: number;
}

/** Orden de las líneas de arriba abajo: los delanteros primero. */
const LINE_ORDER: PositionCode[] = ["DL", "MC", "DF", "PT"];

export function Pitch({ players }: { players: PitchPlayer[] }) {
  const lines = LINE_ORDER.map((code) => ({
    code,
    players: players.filter((p) => positionCode(p.positionId) === code),
  })).filter((line) => line.players.length > 0);

  return (
    <div
      className="relative overflow-hidden border"
      style={{
        borderColor: "var(--color-rule)",
        background: "#0e2a1d",
        aspectRatio: "3 / 4",
        minHeight: "22rem",
        maxHeight: "34rem",
      }}
    >
      <MowStripes />
      <PitchLines />

      <div className="relative flex h-full flex-col justify-around px-2 py-4 sm:px-4">
        {lines.map((line) => (
          <div key={line.code} className="flex justify-around gap-1">
            {line.players.map((player) => (
              <PlayerChip key={player.playerId} player={player} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * El corte del césped. Ocho franjas de un 3% de luz: no se miran, pero sin
 * ellas el campo es un rectángulo verde y con ellas es un campo.
 */
function MowStripes() {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        backgroundImage:
          "repeating-linear-gradient(180deg, rgba(255,255,255,.035) 0 12.5%, transparent 12.5% 25%)",
      }}
    />
  );
}

/** Las marcas del campo. Decorativas: no aportan dato, solo lo hacen legible. */
function PitchLines() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 300 400"
      preserveAspectRatio="none"
      aria-hidden
      style={{
        stroke: "rgba(255,255,255,0.20)",
        strokeWidth: 1.5,
        fill: "none",
      }}
    >
      <rect x="8" y="8" width="284" height="384" rx="3" />
      <line x1="8" y1="200" x2="292" y2="200" />
      <circle cx="150" cy="200" r="40" />
      <circle cx="150" cy="200" r="2" fill="rgba(255,255,255,0.2)" />
      {/* Áreas: la de abajo es la propia. */}
      <rect x="78" y="330" width="144" height="62" />
      <rect x="112" y="368" width="76" height="24" />
      <circle cx="150" cy="348" r="2" fill="rgba(255,255,255,0.2)" />
      <rect x="78" y="8" width="144" height="62" />
      <rect x="112" y="8" width="76" height="24" />
      <circle cx="150" cy="52" r="2" fill="rgba(255,255,255,0.2)" />
      {/* Córners. */}
      <path d="M8 20a12 12 0 0 0 12-12M292 20a12 12 0 0 1-12-12M8 380a12 12 0 0 1 12 12M292 380a12 12 0 0 0-12 12" />
    </svg>
  );
}

function PlayerChip({ player }: { player: PitchPlayer }) {
  // Tiza, ámbar o rojo según lo probable que sea que no juegue.
  const risk = player.riskOfZero;
  const color = risk >= 0.5 ? "#ff8272" : risk >= 0.25 ? "#f0b440" : "#f4f5f0";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <div
        className="scoreline flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold sm:h-11 sm:w-11 sm:text-[15px]"
        style={{
          background: color,
          color: "#0b2018",
          boxShadow: "0 2px 6px rgba(0,0,0,.35), inset 0 -2px 0 rgba(0,0,0,.12)",
        }}
        title={`${player.name} · ${player.expectedPoints.toFixed(1)} puntos esperados · ${(risk * 100).toFixed(0)}% de no jugar`}
      >
        {player.expectedPoints.toFixed(0)}
      </div>
      <span
        className="w-full truncate text-center text-[10px] font-medium leading-tight text-white/90 sm:text-[11px]"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,.7)" }}
      >
        {apellido(player.name)}
      </span>
    </div>
  );
}

/**
 * En una ficha de 40px no cabe "Robert Lewandowski". Se queda la última
 * palabra, que es como se conoce a casi todos los futbolistas.
 */
function apellido(name: string): string {
  const partes = name.trim().split(/\s+/);
  return partes.length > 1 ? partes[partes.length - 1]! : name;
}
