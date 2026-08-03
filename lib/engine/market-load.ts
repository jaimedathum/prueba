import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  activityEvents,
  managers,
  marketListings,
  playerValueSnapshots,
  players,
  rosterEntries,
} from "@/lib/db/schema";
import { bidMultiplier } from "@/lib/domain/activity";
import { FALLBACK_FORMATIONS, type PositionCode } from "@/lib/domain/positions";
import {
  calibrate,
  estimateAmountPriors,
  estimateCash,
  type BudgetEvent,
  type CashBand,
} from "./budget";
import { optimalBid, type AuctionResult, type RivalBidder } from "./auction";
import {
  estimateEuroPerPoint,
  planTransfers,
  type MarketOption,
  type SquadPlayer,
  type TransferResult,
} from "./transfers";
import {
  evaluateSpeculation,
  type SpeculationResult,
} from "./speculation";
import {
  buildFeatures,
  buildTrainingSet,
  fitPriceModel,
  heuristicPrediction,
  predictPrice,
  validateTemporally,
  type PriceSeries,
  type Validation,
} from "./value";
import { buildProjectionContext, type PlayerSeed } from "./projection-context";
import type { Formation } from "./lineup";

/**
 * Ensamblado de la fase 3: precios, fichajes y subasta.
 *
 * El orden importa y no es casual. El optimizador de fichajes se ejecuta antes
 * que la subasta porque produce el **coste real del euro**, y sin ese número
 * la puja óptima estaría mal calculada: pujar con la caja llena y con la caja
 * justa no es lo mismo.
 */

const HORIZON_DAYS = 7;
const HORIZON_MATCHDAYS = 5;

const FORMATIONS: Formation[] = FALLBACK_FORMATIONS.map((slots) => ({
  name: `${slots.DF}-${slots.MC}-${slots.DL}`,
  slots: slots as Record<PositionCode, number>,
}));

export interface MarketCandidate {
  playerId: string;
  name: string;
  positionId: number;
  marketValue: number;
  expectedPoints: number;
  auction: AuctionResult;
  speculation: SpeculationResult;
}

export interface MarketDashboard {
  myCash: number;
  cashCostMultiplier: number;
  euroPerPoint: number | null;
  transfers: TransferResult;
  candidates: MarketCandidate[];
  priceModelUsable: boolean;
  validation: Validation | null;
  warnings: string[];
}

export async function getMarketDashboard(): Promise<MarketDashboard | null> {
  const db = getDb();
  const warnings: string[] = [];

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

  /* --- Caja ---------------------------------------------------------- */

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
  const myCash = bands.get(me.id)?.point ?? 0;

  /* --- Modelo de precios --------------------------------------------- */

  const snapshots = await db
    .select()
    .from(playerValueSnapshots)
    .orderBy(asc(playerValueSnapshots.capturedOn));

  const seriesByPlayer = new Map<string, PriceSeries>();
  for (const row of snapshots) {
    const series = seriesByPlayer.get(row.playerId) ?? [];
    series.push({
      playerId: row.playerId,
      capturedOn: row.capturedOn,
      marketValue: row.marketValue,
      totalPoints: row.totalPoints,
      ownedCount: row.ownedCount,
      onMarket: row.onMarket,
    });
    seriesByPlayer.set(row.playerId, series);
  }

  const trainingSet = buildTrainingSet(
    seriesByPlayer,
    HORIZON_DAYS,
    allManagers.length,
  );
  const priceModel = fitPriceModel(trainingSet, HORIZON_DAYS);
  const validation = validateTemporally(trainingSet, HORIZON_DAYS);

  if (!priceModel.usable) {
    warnings.push(
      `El modelo de precios tiene ${trainingSet.length} muestras y necesita al menos 200. ` +
        "Hasta entonces las predicciones son heurísticas y no sirven para poner dinero.",
    );
  } else if (validation && validation.skill <= 0) {
    warnings.push(
      "El modelo de precios NO bate a la línea base 'mañana vale lo mismo que hoy'. " +
        "No conviene usarlo para especular todavía.",
    );
  }

  /* --- Plantilla y mercado ------------------------------------------- */

  const rosterRows = await db
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
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.id, rosterEntries.playerId))
    .where(eq(rosterEntries.leagueId, leagueId));

  const listings = await db
    .select({
      listingId: marketListings.id,
      playerId: players.id,
      name: players.name,
      positionId: players.positionId,
      status: players.status,
      realTeamId: players.realTeamId,
      totalPoints: players.totalPoints,
      marketValue: marketListings.marketValue,
    })
    .from(marketListings)
    .innerJoin(players, eq(players.id, marketListings.playerId))
    .where(eq(marketListings.leagueId, leagueId));

  const seeds: PlayerSeed[] = [
    ...rosterRows.map(toSeed),
    ...listings.map(toSeed),
  ];
  const context = await buildProjectionContext(seeds);
  warnings.push(...context.warnings);

  const predictionFor = (playerId: string, marketValue: number) => {
    const series = seriesByPlayer.get(playerId);
    const features = series
      ? buildFeatures(series, series.length - 1, allManagers.length)
      : null;
    if (!features) {
      return {
        prediction: heuristicPrediction({
          momentum1: 0,
          momentum3: 0,
          momentum7: 0,
          acceleration: 0,
          recentPoints: 0,
          ownership: 0,
          onMarket: 0,
          logValue: Math.log(Math.max(1, marketValue)),
        }),
      };
    }
    return {
      prediction: priceModel.usable
        ? predictPrice(priceModel, features)
        : heuristicPrediction(features),
    };
  };

  /* --- Fichajes y precio sombra --------------------------------------- */

  const mySquad: SquadPlayer[] = rosterRows
    .filter((row) => row.managerId === me.id && row.marketValue !== null)
    .map((row) => {
      const projection = context.project(toSeed(row));
      const { prediction } = predictionFor(row.playerId, row.marketValue!);
      return {
        playerId: row.playerId,
        name: row.name,
        positionId: row.positionId,
        expectedPoints: projection.expectedPoints,
        riskOfZero: projection.riskOfZero,
        matchPoints: context.matchPointsOf(row.playerId),
        saleValue: row.marketValue!,
        expectedValueChange: row.marketValue! * prediction.median,
      };
    });

  const marketOptions: MarketOption[] = listings
    .filter((row) => row.marketValue > 0)
    .map((row) => {
      const projection = context.project(toSeed(row));
      const { prediction } = predictionFor(row.playerId, row.marketValue);
      return {
        playerId: row.playerId,
        name: row.name,
        positionId: row.positionId,
        expectedPoints: projection.expectedPoints,
        riskOfZero: projection.riskOfZero,
        matchPoints: context.matchPointsOf(row.playerId),
        saleValue: row.marketValue,
        expectedValueChange: row.marketValue * prediction.median,
        // Primera pasada: se supone el suelo. Después la subasta afina.
        acquisitionCost: row.marketValue * priors.bidTypical,
      };
    });

  const euroPerPoint = estimateEuroPerPoint(
    [...mySquad, ...marketOptions].map((p) => ({
      expectedPoints: p.expectedPoints,
      marketValue: p.saleValue,
    })),
  );

  if (euroPerPoint === null) {
    warnings.push(
      "No hay datos suficientes para estimar cuántos euros vale un punto en " +
        "tu liga: las comparaciones entre puntos y dinero son orientativas.",
    );
  }

  const transfers = planTransfers(mySquad, marketOptions, {
    formations: FORMATIONS,
    availableCash: myCash,
    horizonMatchdays: HORIZON_MATCHDAYS,
    euroPerPoint: euroPerPoint ?? 1_000_000,
  });

  /* --- Subasta y especulación ----------------------------------------- */

  const multipliersByManager = new Map<string, number[]>();
  const leagueMultipliers: number[] = [];
  for (const row of rawEvents) {
    const multiplier = bidMultiplier({
      type: row.type,
      amount: row.amount,
      marketValueAtTime: row.marketValueAtTime,
    });
    if (multiplier === null || !row.managerId) continue;
    leagueMultipliers.push(multiplier);
    multipliersByManager.set(row.managerId, [
      ...(multipliersByManager.get(row.managerId) ?? []),
      multiplier,
    ]);
  }

  const bestValueByPositionByManager = new Map<string, Map<number, number>>();
  for (const row of rosterRows) {
    if (row.marketValue === null) continue;
    const byPosition =
      bestValueByPositionByManager.get(row.managerId) ?? new Map<number, number>();
    byPosition.set(
      row.positionId,
      Math.max(byPosition.get(row.positionId) ?? 0, row.marketValue),
    );
    bestValueByPositionByManager.set(row.managerId, byPosition);
  }

  const rivalsFor = (positionId: number, marketValue: number): RivalBidder[] =>
    allManagers
      .filter((manager) => manager.id !== me.id)
      .map((manager) => ({
        managerId: manager.id,
        multipliers: multipliersByManager.get(manager.id) ?? [],
        cash: bands.get(manager.id) as CashBand,
        // Le interesa si mejora lo que ya tiene en esa posición.
        interest: interestFor(
          bestValueByPositionByManager.get(manager.id)?.get(positionId) ?? 0,
          marketValue,
        ),
      }))
      .filter((rival) => rival.cash !== undefined);

  const candidates: MarketCandidate[] = marketOptions
    .map((option) => {
      const { prediction } = predictionFor(option.playerId, option.saleValue);

      // Coste de oportunidad real: los puntos que suma frente a lo que ya
      // tienes, no sus puntos absolutos.
      const replaced = mySquad
        .filter((p) => p.positionId === option.positionId)
        .sort((a, b) => a.expectedPoints - b.expectedPoints)[0];
      const deltaPoints =
        option.expectedPoints - (replaced?.expectedPoints ?? 0);

      const valuation =
        Math.max(0, deltaPoints) * HORIZON_MATCHDAYS * (euroPerPoint ?? 0) +
        option.expectedValueChange +
        option.saleValue;

      return {
        playerId: option.playerId,
        name: option.name,
        positionId: option.positionId,
        marketValue: option.saleValue,
        expectedPoints: option.expectedPoints,
        auction: optimalBid({
          marketValue: option.saleValue,
          myValuation: valuation,
          cashCostMultiplier: transfers.cashCostMultiplier,
          rivals: rivalsFor(option.positionId, option.saleValue),
          leagueMultipliers,
          availableCash: myCash,
        }),
        speculation: evaluateSpeculation({
          playerId: option.playerId,
          name: option.name,
          marketValue: option.saleValue,
          prediction,
          cashCostMultiplier: transfers.cashCostMultiplier,
          // Con la plantilla llena, ocupar una plaza cuesta lo que rendiría
          // el jugador más flojo al que sustituiría.
          slotCost: 0,
          lossTolerance: 0.25,
          // Regla nº 7 sin confirmar: se asume salida casi líquida y se dice.
          liquidityFactor: 0.95,
          availableCash: myCash,
        }),
      };
    })
    .sort(
      (a, b) => b.auction.expectedSurplus - a.auction.expectedSurplus,
    );

  warnings.push(
    "La liquidez de salida se asume casi total (factor 0,95) porque la regla " +
      "nº 7 sigue sin confirmar. Si vender no fuera instantáneo, los precios " +
      "máximos de especulación bajarían.",
  );

  return {
    myCash,
    cashCostMultiplier: transfers.cashCostMultiplier,
    euroPerPoint,
    transfers,
    candidates,
    priceModelUsable: priceModel.usable,
    validation,
    warnings,
  };
}

function toSeed(row: {
  playerId: string;
  name: string;
  positionId: number;
  status: string;
  realTeamId: string | null;
  totalPoints: number | null;
}): PlayerSeed {
  return {
    playerId: row.playerId,
    name: row.name,
    positionId: row.positionId,
    status: row.status,
    realTeamId: row.realTeamId,
    totalPoints: row.totalPoints,
  };
}

/** Un rival solo puja de verdad si el jugador mejora lo que ya tiene. */
function interestFor(bestOwnedValue: number, candidateValue: number): number {
  if (bestOwnedValue <= 0) return 1;
  const ratio = candidateValue / bestOwnedValue;
  return Math.min(1, Math.max(0, (ratio - 0.8) / 0.6));
}
