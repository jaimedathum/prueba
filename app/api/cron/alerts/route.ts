import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alerts/run";
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
    const result = await runAlerts({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
