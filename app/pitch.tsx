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
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: "var(--border)",
        // Verde propio y no un token: el campo es el campo en los dos temas.
        background:
          "linear-gradient(180deg, #15803d 0%, #166534 55%, #14532d 100%)",
        aspectRatio: "3 / 4",
        minHeight: "22rem",
      }}
    >
      <PitchLines />

      <div className="relative flex h-full flex-col justify-around px-2 py-3">
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

/** Las marcas del campo. Decorativas: no aportan dato, solo lo hacen legible. */
function PitchLines() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 300 400"
      preserveAspectRatio="none"
      aria-hidden
      style={{ stroke: "rgba(255,255,255,0.22)", strokeWidth: 2, fill: "none" }}
    >
      <rect x="6" y="6" width="288" height="388" rx="4" />
      <line x1="6" y1="200" x2="294" y2="200" />
      <circle cx="150" cy="200" r="42" />
      {/* Áreas: la de abajo es la propia. */}
      <rect x="75" y="330" width="150" height="64" />
      <rect x="110" y="368" width="80" height="26" />
      <rect x="75" y="6" width="150" height="64" />
      <rect x="110" y="6" width="80" height="26" />
    </svg>
  );
}

function PlayerChip({ player }: { player: PitchPlayer }) {
  // Rojo, ámbar o verde según lo probable que sea que no juegue.
  const risk = player.riskOfZero;
  const color =
    risk >= 0.5 ? "#f87171" : risk >= 0.25 ? "#fbbf24" : "#ffffff";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-md sm:h-11 sm:w-11 sm:text-sm"
        style={{ background: color, color: "#052e16" }}
        title={`${player.name} · ${player.expectedPoints.toFixed(1)} puntos esperados · ${(risk * 100).toFixed(0)}% de no jugar`}
      >
        {player.expectedPoints.toFixed(0)}
      </div>
      <span
        className="w-full truncate text-center text-[10px] font-medium leading-tight text-white sm:text-xs"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}
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
