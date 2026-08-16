import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import NextAuth, { type NextAuthConfig } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { getDb } from "@/lib/db";
import {
  accounts,
  oauthAccounts,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";
import { hasAdminSession } from "@/lib/admin-gate";
import { authEnabled, configuredProviders } from "@/lib/auth-providers";
import {
  DEFAULT_ACCOUNT_ID,
  resolveTenant,
  type TenantContext,
} from "@/lib/tenant";

/**
 * Identidad de la aplicación.
 *
 * Hasta aquí la app no tenía ninguna: todas las páginas eran públicas y lo
 * único cerrado con llave era lo que escribía, mediante un secreto compartido.
 * Esto pone un usuario detrás de cada petición, que es el requisito para que
 * el `TenantContext` deje de ser el singleton `default`.
 *
 * **Los proveedores se activan solos según lo que haya configurado.** Ninguno
 * está codificado como obligatorio: sin variables no se rompe el arranque, se
 * enseña en `/login` qué falta. Es el mismo criterio que en `/setup` — un
 * despliegue a medio configurar tiene que poder decir qué le falta en vez de
 * fallar con una pila de llamadas.
 */

function buildProviders() {
  const enabled = configuredProviders();
  const providers = [];

  if (enabled.google) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      }),
    );
  }

  if (enabled.email) {
    providers.push(
      Nodemailer({
        server: process.env.EMAIL_SERVER!,
        from: process.env.EMAIL_FROM!,
      }),
    );
  }

  return providers;
}

/**
 * A cada usuario, su cuenta.
 *
 * El caso peliagudo es la transición: el despliegue que ya existe tiene una
 * cuenta `default` con todos los datos y **sin dueño**, porque nació antes de
 * que hubiera usuarios. Si el primer registro creara siempre una cuenta nueva,
 * activar el login dejaría al dueño mirando una app vacía mientras sus datos
 * siguen ahí, inalcanzables.
 *
 * Así que la cuenta huérfana se puede **reclamar**, y solo la reclama quien
 * demuestra conocer `CRON_SECRET` — que hasta ahora era exactamente la prueba
 * de ser el dueño del despliegue. La cookie de administración de la fase 0 se
 * convierte aquí en lo que anunciaba que sería.
 */
async function ensureAccountFor(userId: string): Promise<string> {
  const db = getDb();

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.ownerUserId, userId))
    .limit(1);
  if (existing) return existing.id;

  if (await hasAdminSession()) {
    const [orphan] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(isNull(accounts.ownerUserId))
      .limit(1);

    if (orphan) {
      await db
        .update(accounts)
        .set({ ownerUserId: userId })
        .where(eq(accounts.id, orphan.id));
      return orphan.id;
    }
  }

  const id = `acc_${randomUUID()}`;
  await db.insert(accounts).values({ id, ownerUserId: userId });
  return id;
}

/**
 * La configuración se construye **por petición**, no al cargar el módulo.
 *
 * `DrizzleAdapter` quiere una conexión ya hecha, y `getDb()` falla en cuanto
 * no hay `DATABASE_URL`. Construyéndola arriba, el `next build` se rompía al
 * recoger los datos de la ruta de Auth.js: este proyecto compila a propósito
 * sin base de datos —`scripts/migrate.ts` avisa y sigue— para que un portátil
 * sin `.env` pueda ejecutar `npm run build`.
 */
export function buildAuthConfig(): NextAuthConfig {
  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: oauthAccounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: buildProviders(),
    pages: { signIn: "/login" },
    session: { strategy: "database" },
    callbacks: {
      /**
       * La sesión lleva el id de cuenta ya resuelto. Se hace aquí y no en cada
       * página para que no haya forma de olvidarlo en una: si el objeto de
       * sesión lo trae siempre, no existe la ruta que se lo salta.
       */
      async session({ session, user }) {
        session.user.id = user.id;
        session.accountId = await ensureAccountFor(user.id);
        return session;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() =>
  buildAuthConfig(),
);

/** Cuenta de quien está pidiendo, o `null` si no hay sesión. */
export async function currentAccountId(): Promise<string | null> {
  const session = await auth();
  return session?.accountId ?? null;
}

/**
 * Puente hacia el modelo de un solo dueño mientras no haya ningún proveedor
 * configurado. Sin esto, añadir el login dejaría la app inservible en el
 * despliegue que ya funciona hasta terminar de configurar OAuth o SMTP.
 */
export async function accountIdOrDefault(): Promise<string> {
  if (!authEnabled()) {
    return DEFAULT_ACCOUNT_ID;
  }
  const accountId = await currentAccountId();
  if (!accountId) {
    throw new Error("No hay sesión iniciada.");
  }
  return accountId;
}

/**
 * Lo que llama cada pantalla: la cuenta de quien pide, ya resuelta a liga y
 * equipo.
 *
 * Una sola función para que no haya dos formas de averiguar de quién son los
 * datos que se están a punto de enseñar. Cuando hay una sola, revisar que
 * ninguna pantalla se la salta es leer una lista corta.
 */
export async function currentTenant(): Promise<TenantContext> {
  return resolveTenant(await accountIdOrDefault());
}
