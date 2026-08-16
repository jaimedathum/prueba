import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alerts/run";
import { activeLeagues } from "@/lib/tenant";
import { safeEqual } from "@/lib/fantasy/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Aviso diario, pensado para dispararse un rato antes del cierre de mercado.
 *
 * Es independiente de la sincronización a propósito: si la ingesta falla, este
 * job sigue corriendo y precisamente eso es lo primero de lo que avisa.
 *
 * `?dry-run=1` compone el mensaje y lo devuelve sin enviarlo, para poder
 * ajustar los umbrales sin llenarte el móvil de pruebas.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado" },
      { status: 500 },
    );
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry-run") === "1";

  try {
    const leagues = await activeLeagues();
    if (leagues.length === 0) {
      return NextResponse.json({
        ok: true,
        leagues: 0,
        reason: "No hay ninguna liga configurada todavía.",
      });
    }

    /**
     * Una tanda por liga, y el fallo de una no calla a las demás: con varios
     * clientes, que la base de datos de uno falle no puede dejar sin aviso al
     * resto. Por eso se recoge el error de cada una en vez de dejar que
     * tumbe el job entero.
     */
    const results = await Promise.all(
      leagues.map(async (ctx) => {
        try {
          return { leagueId: ctx.leagueId, ...(await runAlerts(ctx, { dryRun })) };
        } catch (error) {
          return {
            leagueId: ctx.leagueId,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return NextResponse.json({ ok: true, leagues: leagues.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
