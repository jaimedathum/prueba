import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/fantasy/crypto";
import { runSync } from "@/lib/ingest/sync";

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
    const result = await runSync();
    return NextResponse.json({
      ok: true,
      leagueId: result.leagueId,
      stats: result.stats,
      warnings: result.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // El fallo se registra en sync_runs desde runSync; aquí solo se reporta.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
