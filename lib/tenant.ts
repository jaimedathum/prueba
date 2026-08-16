import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountLeagues } from "@/lib/db/schema";
import {
  DEFAULT_CLAUSE_MULTIPLIER,
  DEFAULT_INITIAL_BUDGET,
} from "@/lib/engine/rules";

/**
 * Quién está mirando, y qué liga.
 *
 * Todo lo que consulta datos de una liga recibe este objeto **como
 * parámetro**, nunca lo deduce por su cuenta. Antes la identidad se sacaba de
 * `managers.is_me` con un `limit 1` sin `order by`, repetido en cinco
 * cargadores: cada uno redescubría a ciegas de quién eran los datos, y con más
 * de una cuenta cualquiera de los cinco habría devuelto los de otro.
 *
 * Que sea un parámetro y no algo ambiental importa por una razón muy concreta:
 * el worker de sincronización de la fase 1d **no tiene petición ni cookies**.
 * Si la identidad viniera de la sesión, el worker no podría reutilizar nada de
 * esto.
 */

export interface TenantContext {
  accountId: string;
  leagueId: string;
  /** El equipo propio dentro de la liga. Sin esto no hay nada que enseñar. */
  myTeamId: string;
  competitionId: string;
  /** Ya resueltas: la columna manda, y si es nula, el valor del juego. */
  initialBudget: number;
  clauseMultiplier: number;
}

/**
 * La cuenta del despliegue de un solo dueño.
 *
 * Existe mientras no haya registro de usuarios (fase 1b). La migración
 * `0005_multi_tenant` la siembra y le cuelga todo lo que ya había.
 */
export const DEFAULT_ACCOUNT_ID = "default";

export class TenantNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantNotConfiguredError";
  }
}

/**
 * Resuelve el contexto de la cuenta indicada.
 *
 * Lanza en vez de devolver `null` porque las pantallas ya capturan el error y
 * lo enseñan en `SetupNotice`: así el motivo exacto llega al usuario en lugar
 * de convertirse en una página vacía sin explicación.
 */
export async function resolveTenant(
  accountId: string = DEFAULT_ACCOUNT_ID,
): Promise<TenantContext> {
  const db = getDb();

  const [link] = await db
    .select()
    .from(accountLeagues)
    .where(
      and(
        eq(accountLeagues.accountId, accountId),
        eq(accountLeagues.active, true),
      ),
    )
    // Determinista: sin esto, dos ligas activas darían resultados distintos
    // entre peticiones y sería un infierno de diagnosticar.
    .orderBy(asc(accountLeagues.createdAt), asc(accountLeagues.leagueId))
    .limit(1);

  if (!link) {
    throw new TenantNotConfiguredError(
      "No hay ninguna liga configurada para esta cuenta.\n\n" +
        "Ve a /setup y sincroniza: la sincronización descubre tus ligas y " +
        "deja anotada cuál es la tuya.",
    );
  }

  if (!link.myTeamId) {
    throw new TenantNotConfiguredError(
      `La liga ${link.leagueId} está configurada pero no se sabe cuál es tu ` +
        "equipo dentro de ella.\n\n" +
        "Suele pasar cuando hay dos managers con el mismo nombre y la " +
        "detección automática no se atreve a elegir. Sincroniza desde /setup " +
        "para reintentarlo.",
    );
  }

  return {
    accountId: link.accountId,
    leagueId: link.leagueId,
    myTeamId: link.myTeamId,
    competitionId: link.competitionId,
    initialBudget: link.initialBudget ?? DEFAULT_INITIAL_BUDGET,
    clauseMultiplier: link.clauseMultiplier ?? DEFAULT_CLAUSE_MULTIPLIER,
  };
}

/** Todas las ligas activas, que es lo que recorrerá el worker. */
export async function activeLeagues(): Promise<TenantContext[]> {
  const db = getDb();

  const links = await db
    .select()
    .from(accountLeagues)
    .where(eq(accountLeagues.active, true))
    .orderBy(asc(accountLeagues.createdAt));

  return links
    .filter((link) => link.myTeamId !== null)
    .map((link) => ({
      accountId: link.accountId,
      leagueId: link.leagueId,
      myTeamId: link.myTeamId!,
      competitionId: link.competitionId,
      initialBudget: link.initialBudget ?? DEFAULT_INITIAL_BUDGET,
      clauseMultiplier: link.clauseMultiplier ?? DEFAULT_CLAUSE_MULTIPLIER,
    }));
}
