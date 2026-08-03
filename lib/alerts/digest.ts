import type { AttackRecommendation } from "@/lib/engine/clause-attack";
import type { ShieldRecommendation } from "@/lib/engine/clause-defense";
import type { MarketCandidate } from "@/lib/engine/market-load";
import type { TransferResult } from "@/lib/engine/transfers";
import type { Alert } from "./types";

/**
 * Composición del aviso diario.
 *
 * Es una función pura a propósito: recibe lo que los motores ya han calculado
 * y decide qué merece interrumpirte. Así se puede probar el criterio sin base
 * de datos ni red, que es donde de verdad está el riesgo de acabar mandando
 * ruido.
 */

export interface DigestInput {
  today: string;
  shields: ShieldRecommendation[];
  attacks: AttackRecommendation[];
  transfers: TransferResult | null;
  candidates: MarketCandidate[];
  lastSyncFailed: boolean;
  lastSyncError: string | null;
  /** Umbral en euros para que un movimiento merezca aviso. */
  minimumSurplus?: number;
}

const DEFAULT_MINIMUM_SURPLUS = 1_000_000;
/** Por debajo de este riesgo, un blindaje puede esperar a que lo mires tú. */
const URGENT_RISK = 0.35;

export function buildAlerts(input: DigestInput): Alert[] {
  const alerts: Alert[] = [];
  const minimum = input.minimumSurplus ?? DEFAULT_MINIMUM_SURPLUS;

  // Que falle la sincronización es lo más grave: sin datos, todo lo demás
  // que diga la app está calculado sobre información vieja.
  if (input.lastSyncFailed) {
    alerts.push({
      key: `sync-failure:${input.today}`,
      kind: "sync-failure",
      priority: "high",
      title: "La sincronización ha fallado",
      body:
        (input.lastSyncError ?? "Sin detalle.") +
        "\nMientras no se arregle, las recomendaciones salen de datos viejos.",
    });
  }

  for (const shield of input.shields) {
    if (shield.verdict !== "shield" || shield.investment === null) continue;
    if (shield.currentRisk < URGENT_RISK) continue;
    if (shield.expectedGain < minimum) continue;

    alerts.push({
      key: `clause-risk:${shield.playerId}`,
      kind: "clause-risk",
      priority: shield.currentRisk >= 0.6 ? "high" : "medium",
      title: `Riesgo de perder a ${shield.name}`,
      body: shield.reason,
    });
  }

  for (const attack of input.attacks) {
    if (attack.verdict !== "attack") continue;
    if (attack.netSurplus < minimum) continue;

    alerts.push({
      key: `clause-opportunity:${attack.playerId}`,
      kind: "clause-opportunity",
      priority: "medium",
      title: `Clausulazo rentable: ${attack.name}`,
      body: attack.reason,
    });
  }

  if (input.transfers && input.transfers.best.objective >= minimum) {
    const plan = input.transfers.best;
    const identity = [
      ...plan.sell.map((p) => p.playerId),
      ...plan.buy.map((p) => p.playerId),
    ]
      .sort()
      .join("+");

    alerts.push({
      key: `transfer:${identity}`,
      kind: "transfer",
      priority: "medium",
      title: "Movimiento recomendado",
      body: plan.explanation,
    });
  }

  for (const candidate of input.candidates) {
    if (candidate.auction.optimalBid === null) continue;
    if (candidate.auction.expectedSurplus < minimum) continue;

    alerts.push({
      key: `bid:${candidate.playerId}:${input.today}`,
      kind: "bid",
      priority: "medium",
      title: `Puja por ${candidate.name}`,
      body: `${candidate.auction.reason}\nPuja pronto y con cifra no redonda.`,
    });
  }

  for (const candidate of input.candidates) {
    if (candidate.speculation.verdict !== "buy") continue;
    if (candidate.speculation.maxPrice === null) continue;

    alerts.push({
      key: `speculation:${candidate.playerId}`,
      kind: "speculation",
      // Especular nunca es urgente: si se pasa la oportunidad, no pasa nada.
      priority: "low",
      title: `Chollo especulativo: ${candidate.name}`,
      body: candidate.speculation.reason,
    });
  }

  return alerts;
}
