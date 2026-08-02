import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  managers,
  players,
  rosterEntries,
  syncRuns,
} from "@/lib/db/schema";
import { applyOverrides, loadOverrides, type Overridden } from "@/lib/overrides";
import { positionCode } from "@/lib/domain/positions";

/**
 * Lecturas para la interfaz. Todas pasan por la capa de overrides: lo que se
 * enseña es el dato sincronizado con las correcciones manuales aplicadas
 * encima, marcando cuáles vienen de dónde.
 */

export interface SquadRow extends Overridden {
  playerId: string;
  name: string;
  position: string;
  status: string;
  marketValue: number | null;
  buyoutClause: number | null;
  /**
   * Cuánto costaría a un rival quedárselo, en proporción a lo que vale.
   * Por debajo de 1 el jugador está regalado.
   */
  clauseRatio: number | null;
}

export interface DashboardData {
  me: { id: string; teamName: string; reportedBalance: number | null } | null;
  squad: SquadRow[];
  lastSync: {
    startedAt: Date;
    finishedAt: Date | null;
    status: string;
    stats: Record<string, number> | null;
    error: string | null;
  } | null;
}

export async function getDashboardData(): Promise<DashboardData> {
  const db = getDb();

  const [lastSync] = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  const [me] = await db
    .select()
    .from(managers)
    .where(eq(managers.isMe, true))
    .limit(1);

  if (!me) {
    return { me: null, squad: [], lastSync: lastSync ?? null };
  }

  const rows = await db
    .select({
      playerId: players.id,
      name: players.name,
      positionId: players.positionId,
      status: players.status,
      marketValue: players.marketValue,
      buyoutClause: rosterEntries.buyoutClause,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.id, rosterEntries.playerId))
    .where(eq(rosterEntries.managerId, me.id));

  const overrides = await loadOverrides("player");
  const withOverrides = applyOverrides(rows, (row) => row.playerId, overrides);

  const squad: SquadRow[] = withOverrides
    .map((row) => ({
      playerId: row.playerId,
      name: row.name,
      position: positionCode(row.positionId),
      status: row.status,
      marketValue: row.marketValue,
      buyoutClause: row.buyoutClause,
      clauseRatio:
        row.buyoutClause && row.marketValue
          ? row.buyoutClause / row.marketValue
          : null,
      overriddenFields: row.overriddenFields,
    }))
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));

  return {
    me: {
      id: me.id,
      teamName: me.teamName,
      reportedBalance: me.reportedBalance,
    },
    squad,
    lastSync: lastSync ?? null,
  };
}

export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
