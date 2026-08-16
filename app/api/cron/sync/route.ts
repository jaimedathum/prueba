import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/fantasy/crypto";
import { runSync } from "@/lib/ingest/sync";
import { syncGlobal } from "@/lib/ingest/sync-global";
import { activeLeagues } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Disparador diario de la sincronización.
 *
 * Se despliega y se activa antes que la interfaz: cada día sin ejecutarse es
 * histórico de mercado perdido para siempre, y eso no se recupera después.
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

  try {
    const leagues = await activeLeagues();

    /**
     * Sin ninguna liga configurada todavía, una pasada normal: es el caso del
     * despliegue recién montado, donde la propia sincronización descubre la
     * liga y la anota.
     */
    if (leagues.length === 0) {
      const result = await runSync();
      return NextResponse.json({
        ok: true,
        leagueId: result.leagueId,
        stats: result.stats,
        warnings: result.warnings,
      });
    }

    /**
     * El bloque global **una vez**, y después cada liga.
     *
     * Aquí es donde se ve el reparto: el catálogo de jugadores, las 38
     * jornadas de calendario y las estadísticas son idénticas para todos, así
     * que se piden una sola vez por tanda. Solo se multiplica lo que de verdad
     * cambia entre ligas — clasificación, plantillas, mercado y actividad—, y
     * se multiplica por liga, no por usuario.
     */
    const global = await syncGlobal({ accountId: leagues[0]!.accountId });

    const results = [];
    for (const ctx of leagues) {
      try {
        const result = await runSync({
          accountId: ctx.accountId,
          leagueId: ctx.leagueId,
          skipGlobal: true,
        });
        results.push({ leagueId: ctx.leagueId, stats: result.stats, warnings: result.warnings });
      } catch (error) {
        // El fallo de una liga no puede dejar sin sincronizar a las demás.
        results.push({
          leagueId: ctx.leagueId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      global: { stats: global.stats, warnings: global.warnings },
      leagues: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // El fallo se registra en sync_runs desde runSync; aquí solo se reporta.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
