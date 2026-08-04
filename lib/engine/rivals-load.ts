import { asc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  activityEvents,
  managers,
  players,
  rosterEntries,
} from "@/lib/db/schema";
import { FALLBACK_FORMATIONS, type PositionCode } from "@/lib/domain/positions";
import {
  calibrate,
  estimateAmountPriors,
  estimateCash,
  type AmountPriors,
  type BudgetEvent,
  type CashBand,
} from "./budget";
import { optimizeLineup, type Formation, type LineupCandidate } from "./lineup";
import { buildProjectionContext } from "./projection-context";
import { rankAttacks, type AttackRecommendation, type ClauseTarget } from "./clause-attack";
import type { RivalProfile } from "./exposure";

/**
 * La liga vista rival a rival.
 *
 * No hay ningún motor nuevo aquí: la caja, la exposición y los clausulazos ya
 * se calculaban. Lo que cambia es el eje. `/riesgo` ordena por mecanismo —una
 * tabla de cajas, otra de amenazas— y responde a "¿cuán expuesto estoy?".
 * Esto ordena por persona y responde a la pregunta que uno se hace de verdad
 * delante del móvil: **"¿qué hago con este?"**.
 *
 * Sobre los puntos del rival: no sabemos a quién va a alinear, así que se
 * calcula **su once óptimo** con el mismo optimizador que el propio. Es "lo
 * mejor que puede sacar", no "lo que va a sacar", y así se dice en la
 * interfaz. Suponer que un rival alinea mal sería regalarle ventaja al
 * análisis.
 */

const HORIZON_DAYS = 14;

const FORMATIONS: Formation[] = FALLBACK_FORMATIONS.map((slots) => ({
  name: `${slots.DF}-${slots.MC}-${slots.DL}`,
  slots: slots as Record<PositionCode, number>,
}));

export interface RivalPlayer {
  playerId: string;
  name: string;
  positionId: number;
  expectedPoints: number;
  riskOfZero: number;
  marketValue: number | null;
  buyoutClause: number | null;
}

export interface RivalView {
  managerId: string;
  teamName: string;
  managerName: string | null;
  /** Banda de caja: nunca una cifra, porque no se conoce. */
  cash: CashBand;
  /** Cuánto ha pujado por encima del valor, aprendido de sus movimientos. */
  bidMultiplier: number | null;
  observedMoves: number;
  squadValue: number;
  /** Puntos del mejor once que puede poner, no del que pondrá. */
  bestElevenPoints: number;
  formation: string | null;
  squad: RivalPlayer[];
  starters: RivalPlayer[];
  /** Sus jugadores que te salen a cuenta clausular, ya ordenados. */
  targets: AttackRecommendation[];
  alerts: string[];
}

export interface RivalsDashboard {
  rivals: RivalView[];
  warnings: string[];
}

export async function getRivalsDashboard(): Promise<RivalsDashboard | null> {
  const db = getDb();

  const [me] = await db
    .select()
    .from(managers)
    .where(eq(managers.isMe, true))
    .limit(1);
  if (!me) return null;

  const leagueId = me.leagueId;
  const warnings: string[] = [];

  const allManagers = await db
    .select()
    .from(managers)
    .where(eq(managers.leagueId, leagueId));

  /* --- Caja, del feed de actividad --------------------------------- */

  const rawEvents = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.leagueId, leagueId))
    .orderBy(asc(activityEvents.occurredAt));

  const events: BudgetEvent[] = rawEvents.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    type: row.type,
    managerId: row.managerId,
    counterpartyManagerId: row.counterpartyManagerId,
    playerId: row.playerId,
    amount: row.amount,
    amountCertain: row.amountCertain,
    marketValueAtTime: row.marketValueAtTime,
  }));

  const priors = estimateAmountPriors(events);
  const { bands } = calibrate(
    estimateCash(
      allManagers.map((m) => m.id),
      events,
      { priors },
    ),
    me.id,
    me.reportedBalance,
  );

  const sinClasificar = events.filter((e) => e.type === "unknown").length;
  if (sinClasificar > 0) {
    warnings.push(
      `${sinClasificar} de ${events.length} movimientos del feed no se han ` +
        "podido clasificar, así que las cajas salen más anchas de lo " +
        "necesario. Se estrecharán solas conforme se reconozcan más tipos.",
    );
  }
  if (events.length === 0) {
    warnings.push(
      "El feed de actividad está vacío: las cajas son solo el presupuesto " +
        "inicial supuesto, iguales para todos. Hasta que haya movimientos, " +
        "esta pantalla dice poco de quién puede pagar qué.",
    );
  }

  /* --- Plantillas de todos ----------------------------------------- */

  const rows = await db
    .select({
      managerId: rosterEntries.managerId,
      playerId: players.id,
      name: players.name,
      positionId: players.positionId,
      status: players.status,
      realTeamId: players.realTeamId,
      totalPoints: players.totalPoints,
      marketValue: players.marketValue,
      buyoutClause: rosterEntries.buyoutClause,
      clauseLockedUntil: rosterEntries.clauseLockedUntil,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.id, rosterEntries.playerId))
    .where(eq(rosterEntries.leagueId, leagueId));

  const context = await buildProjectionContext(rows);
  warnings.push(...context.warnings);

  /* --- Perfiles, para el motor de clausulazos ----------------------- */

  const attacksByManager = new Map<string, number>();
  for (const event of events) {
    if (event.type === "clause_paid" && event.managerId) {
      attacksByManager.set(
        event.managerId,
        (attacksByManager.get(event.managerId) ?? 0) + 1,
      );
    }
  }

  const bestValueByPosition = (managerId: string) => {
    const out = new Map<number, number>();
    for (const row of rows) {
      if (row.managerId !== managerId || row.marketValue === null) continue;
      out.set(
        row.positionId,
        Math.max(out.get(row.positionId) ?? 0, row.marketValue),
      );
    }
    return out;
  };

  const rivalProfiles: RivalProfile[] = allManagers
    .filter((m) => m.id !== me.id)
    .map((m) => ({
      managerId: m.id,
      cash: bands.get(m.id)!,
      clauseAttacks: attacksByManager.get(m.id) ?? 0,
      bestValueByPosition: bestValueByPosition(m.id),
    }));

  const firstEvent = events[0]?.occurredAt.getTime() ?? Date.now();
  const observedDays = Math.max(
    1,
    Math.round((Date.now() - firstEvent) / (24 * 60 * 60 * 1000)),
  );
  const exposureOptions = { observedDays, horizonDays: HORIZON_DAYS, priors };

  const valuationOf = (marketValue: number | null) =>
    (marketValue ?? 0) * priors.bidTypical;

  const mySquad = rows
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

  const myCash = bands.get(me.id)?.point ?? 0;

  /* --- Una vista por rival ------------------------------------------ */

  const rivals: RivalView[] = allManagers
    .filter((m) => m.id !== me.id)
    .map((manager) => {
      const suyos = rows.filter((row) => row.managerId === manager.id);

      const candidates: LineupCandidate[] = suyos.map((seed) => {
        const projection = context.project(seed);
        return {
          playerId: seed.playerId,
          name: seed.name,
          positionId: seed.positionId,
          expectedPoints: projection.expectedPoints,
          riskOfZero: projection.riskOfZero,
          matchPoints: context.matchPointsOf(seed.playerId),
        };
      });

      const lineup = optimizeLineup(candidates, FORMATIONS);
      const byId = new Map(candidates.map((c) => [c.playerId, c]));

      const aRivalPlayer = (row: (typeof suyos)[number]): RivalPlayer => {
        const c = byId.get(row.playerId);
        return {
          playerId: row.playerId,
          name: row.name,
          positionId: row.positionId,
          expectedPoints: c?.expectedPoints ?? 0,
          riskOfZero: c?.riskOfZero ?? 1,
          marketValue: row.marketValue,
          buyoutClause: row.buyoutClause,
        };
      };

      const starterIds = new Set(lineup?.starters.map((s) => s.playerId) ?? []);

      // Clausulazos, pero solo contra este rival: la pregunta es "¿qué le
      // quito a él?", no "¿qué le quito a alguien?".
      const targets: ClauseTarget[] = suyos
        .filter((row) => row.marketValue !== null && row.buyoutClause !== null)
        .map((row) => ({
          playerId: row.playerId,
          name: row.name,
          positionId: row.positionId,
          marketValue: row.marketValue!,
          buyoutClause: row.buyoutClause!,
          ownerManagerId: manager.id,
          clauseLockedUntil: row.clauseLockedUntil,
          ownValuation: valuationOf(row.marketValue),
        }));

      const ranked = rankAttacks(targets, {
        myCash,
        mySquad,
        rivals: rivalProfiles,
        options: exposureOptions,
      }).filter((a) => a.verdict === "attack");

      const cash = bands.get(manager.id)!;
      const squadValue = suyos.reduce((acc, r) => acc + (r.marketValue ?? 0), 0);

      const misMultiplicadores = events.filter(
        (e) => e.managerId === manager.id && e.amountCertain,
      ).length;

      return {
        managerId: manager.id,
        teamName: manager.teamName,
        managerName: manager.managerName,
        cash,
        bidMultiplier: misMultiplicadores > 0 ? priors.bidTypical : null,
        observedMoves: events.filter((e) => e.managerId === manager.id).length,
        squadValue,
        bestElevenPoints: lineup?.expectedPoints ?? 0,
        formation: lineup?.formation.name ?? null,
        squad: suyos.map(aRivalPlayer),
        starters: (lineup?.starters ?? []).map((s) => {
          const row = suyos.find((r) => r.playerId === s.playerId)!;
          return aRivalPlayer(row);
        }),
        targets: ranked,
        alerts: buildAlerts({
          cash,
          myCash,
          targets: ranked,
          attacks: attacksByManager.get(manager.id) ?? 0,
          starterCount: starterIds.size,
          squadSize: suyos.length,
        }),
      };
    })
    // El más peligroso primero: quien más caja tiene, más puede quitarte.
    .sort((a, b) => b.cash.max - a.cash.max);

  return { rivals, warnings };
}

/**
 * Los avisos por rival.
 *
 * Deliberadamente pocos y concretos. Una lista de diez observaciones por
 * persona no se lee; tres que digan qué hacer, sí.
 */
function buildAlerts(input: {
  cash: CashBand;
  myCash: number;
  targets: AttackRecommendation[];
  attacks: number;
  starterCount: number;
  squadSize: number;
}): string[] {
  const alerts: string[] = [];

  if (input.cash.min > input.myCash) {
    alerts.push(
      "Tiene más dinero que tú incluso en su escenario más pobre: puede " +
        "pagar cláusulas que tú no.",
    );
  }

  if (input.attacks > 0) {
    alerts.push(
      `Ya ha clausulado ${input.attacks} ${input.attacks === 1 ? "vez" : "veces"}: ` +
        "no es de los que se quedan mirando.",
    );
  }

  const mejor = input.targets[0];
  if (mejor) {
    alerts.push(
      `Te sale a cuenta clausularle a ${mejor.name}: ${mejor.reason}`,
    );
  }

  if (input.squadSize > 0 && input.starterCount < 11) {
    alerts.push(
      `Solo puede formar ${input.starterCount} de 11 con lo que tiene: va ` +
        "corto de plantilla y necesitará fichar.",
    );
  }

  return alerts;
}

export { ne };
