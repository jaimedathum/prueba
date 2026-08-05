import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  activityEvents,
  managers,
  playerValueSnapshots,
  players,
  rosterEntries,
} from "@/lib/db/schema";
import { applyOverrides, loadOverrides } from "@/lib/overrides";
import {
  calibrate,
  estimateAmountPriors,
  estimateCash,
  inferInitialBudget,
  type AmountPriors,
  type BudgetEvent,
  type CashBand,
  type CalibrationResult,
} from "./budget";
import type { RivalProfile } from "./exposure";
import {
  planShielding,
  recommendShield,
  type DefendablePlayer,
  type ShieldPlan,
  type ShieldRecommendation,
} from "./clause-defense";
import {
  rankAttacks,
  type AttackRecommendation,
  type ClauseTarget,
} from "./clause-attack";
import { UnconfirmedRuleError, requireShieldingRules } from "./rules";

/**
 * Ensamblado de la fase 1: coge lo sincronizado y lo pasa por los motores.
 *
 * Todo lo que necesita una regla sin confirmar se aísla para que su ausencia
 * degrade la vista en vez de tumbarla: sin el multiplicador de blindaje sigues
 * viendo la caja de los rivales y tu exposición, que ya es la mitad del valor.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RiskDashboard {
  leagueId: string;
  myManagerId: string;
  managerNames: Map<string, string>;
  bands: Map<string, CashBand>;
  calibration: CalibrationResult;
  priors: AmountPriors;
  observedDays: number;
  horizonDays: number;
  mySquad: DefendablePlayer[];
  shields: ShieldRecommendation[];
  shieldPlan: ShieldPlan | null;
  /** Mensaje cuando falta una regla del juego por confirmar. */
  shieldBlockedReason: string | null;
  attacks: AttackRecommendation[];
  myCash: number;
}

/**
 * Valor de mercado del jugador en la fecha del evento.
 *
 * Es el ancla que permite acotar los importes que el feed no expone. Sin
 * histórico todavía no hay ancla, y las bandas salen más anchas: es correcto,
 * refleja que de verdad se sabe menos.
 */
async function buildValueLookup(
  playerIds: string[],
): Promise<(playerId: string, when: Date) => number | null> {
  if (playerIds.length === 0) return () => null;

  const db = getDb();
  const rows = await db
    .select({
      playerId: playerValueSnapshots.playerId,
      capturedOn: playerValueSnapshots.capturedOn,
      marketValue: playerValueSnapshots.marketValue,
    })
    .from(playerValueSnapshots)
    .where(inArray(playerValueSnapshots.playerId, playerIds))
    .orderBy(asc(playerValueSnapshots.capturedOn));

  const byPlayer = new Map<string, Array<{ time: number; value: number }>>();
  for (const row of rows) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push({ time: new Date(row.capturedOn).getTime(), value: row.marketValue });
    byPlayer.set(row.playerId, list);
  }

  return (playerId, when) => {
    const series = byPlayer.get(playerId);
    if (!series || series.length === 0) return null;

    const target = when.getTime();
    // Último snapshot en o antes de la fecha; si el evento es anterior a todo
    // el histórico, se usa el primero disponible como mejor aproximación.
    let best = series[0]!;
    for (const point of series) {
      if (point.time <= target) best = point;
      else break;
    }
    return best.value;
  };
}

export async function getRiskDashboard(
  horizonDays = 14,
): Promise<RiskDashboard | null> {
  const db = getDb();

  const [me] = await db
    .select()
    .from(managers)
    .where(eq(managers.isMe, true))
    .limit(1);
  if (!me) return null;

  const leagueId = me.leagueId;

  const allManagers = await db
    .select()
    .from(managers)
    .where(eq(managers.leagueId, leagueId));

  const rawEvents = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.leagueId, leagueId))
    .orderBy(asc(activityEvents.occurredAt));

  const eventPlayerIds = [
    ...new Set(rawEvents.map((e) => e.playerId).filter((id): id is string => !!id)),
  ];
  const valueAt = await buildValueLookup(eventPlayerIds);

  const events: BudgetEvent[] = rawEvents.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    type: row.type,
    managerId: row.managerId,
    counterpartyManagerId: row.counterpartyManagerId,
    playerId: row.playerId,
    amount: row.amount,
    amountCertain: row.amountCertain,
    marketValueAtTime:
      row.marketValueAtTime ??
      (row.playerId ? valueAt(row.playerId, row.occurredAt) : null),
  }));

  const firstEvent = events[0]?.occurredAt.getTime() ?? Date.now();
  const observedDays = Math.max(1, Math.round((Date.now() - firstEvent) / DAY_MS));

  const priors = estimateAmountPriors(events);
  // Con el saldo propio y sin movimientos propios, el presupuesto inicial se
  // deduce en vez de suponerse, y las bandas de todos dejan de arrastrar el
  // error de una semilla equivocada.
  const seed = inferInitialBudget(events, me.id, me.reportedBalance);
  const rawBands = estimateCash(
    allManagers.map((m) => m.id),
    events,
    { priors, initialBudget: seed ?? undefined },
  );
  const { bands, calibration } = calibrate(rawBands, me.id, me.reportedBalance);

  /* --- Plantillas ------------------------------------------------- */

  const rosterRows = await db
    .select({
      managerId: rosterEntries.managerId,
      playerId: players.id,
      name: players.name,
      positionId: players.positionId,
      marketValue: players.marketValue,
      buyoutClause: rosterEntries.buyoutClause,
      clauseLockedUntil: rosterEntries.clauseLockedUntil,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.id, rosterEntries.playerId))
    .where(eq(rosterEntries.leagueId, leagueId));

  const overrides = await loadOverrides("player");
  const roster = applyOverrides(rosterRows, (row) => row.playerId, overrides);

  /**
   * Lo que un jugador vale para ti: su **coste de reposición**.
   *
   * No es su valor de mercado. Si lo pierdes, para tener un equivalente
   * tienes que ganar una subasta, y en esta liga eso cuesta `bidTypical`
   * veces el valor — un multiplicador aprendido del feed, no inventado.
   *
   * De aquí sale una afirmación económica exacta: si la cláusula supera el
   * coste de reposición, que te lo clausulen te deja más dinero del que
   * necesitas para reemplazarlo. Ahí no se blinda.
   *
   * En la fase 2 esto se sustituye por puntos esperados convertidos a euros,
   * que capta además lo que un jugador aporta a TU once en concreto.
   */
  const valuationOf = (marketValue: number | null) =>
    (marketValue ?? 0) * priors.bidTypical;

  const mySquad: DefendablePlayer[] = roster
    .filter((row) => row.managerId === me.id && row.marketValue !== null)
    .map((row) => ({
      playerId: row.playerId,
      name: row.name,
      positionId: row.positionId,
      marketValue: row.marketValue!,
      buyoutClause: row.buyoutClause ?? row.marketValue!,
      clauseLockedUntil: row.clauseLockedUntil,
      ownValuation: valuationOf(row.marketValue),
    }));

  /* --- Perfiles de rival ------------------------------------------- */

  const attacksByManager = new Map<string, number>();
  for (const event of events) {
    if (event.type === "clause_paid" && event.managerId) {
      attacksByManager.set(
        event.managerId,
        (attacksByManager.get(event.managerId) ?? 0) + 1,
      );
    }
  }

  const rivals: RivalProfile[] = allManagers
    .filter((m) => m.id !== me.id)
    .map((manager) => {
      const bestValueByPosition = new Map<number, number>();
      for (const row of roster) {
        if (row.managerId !== manager.id || row.marketValue === null) continue;
        const current = bestValueByPosition.get(row.positionId) ?? 0;
        if (row.marketValue > current) {
          bestValueByPosition.set(row.positionId, row.marketValue);
        }
      }
      return {
        managerId: manager.id,
        cash: bands.get(manager.id)!,
        clauseAttacks: attacksByManager.get(manager.id) ?? 0,
        bestValueByPosition,
      };
    });

  const exposureOptions = { observedDays, horizonDays, priors };

  /* --- Blindaje (depende de una regla sin confirmar) --------------- */

  let shields: ShieldRecommendation[] = [];
  let shieldPlan: ShieldPlan | null = null;
  let shieldBlockedReason: string | null = null;
  const myCash = bands.get(me.id)?.point ?? 0;

  try {
    const rules = requireShieldingRules();
    shields = mySquad
      .map((player) =>
        recommendShield(player, rivals, { ...exposureOptions, rules }),
      )
      .sort((a, b) => b.currentRisk - a.currentRisk);
    shieldPlan = planShielding(shields, myCash);
  } catch (error) {
    if (error instanceof UnconfirmedRuleError) {
      shieldBlockedReason = error.message;
    } else {
      throw error;
    }
  }

  /* --- Clausulazos ------------------------------------------------- */

  const targets: ClauseTarget[] = roster
    .filter(
      (row) =>
        row.managerId !== me.id &&
        row.marketValue !== null &&
        row.buyoutClause !== null,
    )
    .map((row) => ({
      playerId: row.playerId,
      name: row.name,
      positionId: row.positionId,
      marketValue: row.marketValue!,
      buyoutClause: row.buyoutClause!,
      ownerManagerId: row.managerId,
      clauseLockedUntil: row.clauseLockedUntil,
      ownValuation: valuationOf(row.marketValue),
    }));

  const attacks = rankAttacks(targets, {
    myCash,
    mySquad,
    rivals,
    options: exposureOptions,
  }).slice(0, 20);

  return {
    leagueId,
    myManagerId: me.id,
    managerNames: new Map(allManagers.map((m) => [m.id, m.teamName])),
    bands,
    calibration,
    priors,
    observedDays,
    horizonDays,
    mySquad,
    shields,
    shieldPlan,
    shieldBlockedReason,
    attacks,
    myCash,
  };
}
