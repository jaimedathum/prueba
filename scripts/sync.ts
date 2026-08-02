#!/usr/bin/env tsx
/**
 * CLI de sincronización.
 *
 *   npm run sync                 sincroniza y escribe en la base de datos
 *   npm run sync -- --dry-run    lee de la API e informa, sin escribir nada
 *   npm run sync -- --shape      añade el informe de mapeo de campos
 *   npm run sync -- --offline    ni red ni base de datos: solo valida rutas
 *   npm run sync -- --login      inicia sesión y guarda el refresh token
 */
import { closeDb } from "@/lib/db";
import { FantasySession, loginWithPassword } from "@/lib/fantasy/auth";
import { FantasyClient } from "@/lib/fantasy/client";
import { endpoints } from "@/lib/fantasy/endpoints";
import { runSync } from "@/lib/ingest/sync";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables del entorno tal cual.
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const offline = args.has("--offline");
const shape = args.has("--shape");
const login = args.has("--login");

const leagueArg = process.argv
  .slice(2)
  .find((a) => a.startsWith("--league="))
  ?.split("=")[1];

async function doLogin(): Promise<void> {
  const email = process.env.FANTASY_EMAIL;
  const password = process.env.FANTASY_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Configura FANTASY_EMAIL y FANTASY_PASSWORD en .env para el login inicial. " +
        "Puedes borrarlas después: solo se guarda el refresh token, cifrado.",
    );
  }
  const tokens = await loginWithPassword(email, password);
  await new FantasySession().adopt(tokens);
  console.log("Sesión iniciada. Refresh token guardado cifrado.");
  console.log("Ya puedes borrar FANTASY_PASSWORD del .env.");
}

async function doOfflineCheck(): Promise<void> {
  // Comprueba que todas las rutas que usa la sincronización pasan la
  // allowlist, sin credenciales y sin red. Útil en CI.
  const client = new FantasyClient({ offline: true, minIntervalMs: 0 });
  const planned = [
    endpoints.me(),
    endpoints.leagues(),
    endpoints.standing("LEAGUE"),
    endpoints.players(),
    endpoints.team("LEAGUE", "TEAM"),
    endpoints.market("LEAGUE"),
    endpoints.activity("LEAGUE", 0),
    endpoints.currentWeek(),
    endpoints.calendar(),
    endpoints.formations(),
  ];
  for (const path of planned) {
    await client.get(path);
  }
  console.log("Rutas validadas contra la allowlist:");
  for (const request of client.plannedRequests) {
    console.log(`  GET ${request}`);
  }
  console.log(`\n${client.plannedRequests.length} rutas, todas de lectura.`);
}

async function main(): Promise<void> {
  if (login) {
    await doLogin();
    return;
  }

  if (offline) {
    await doOfflineCheck();
    return;
  }

  if (dryRun) {
    console.log("Modo dry-run: se lee de la API pero NO se escribe nada.\n");
  }

  const result = await runSync({
    persist: !dryRun,
    collectShape: shape,
    leagueId: leagueArg,
    log: (message) => console.log(message),
  });

  console.log("\nResumen:");
  for (const [key, value] of Object.entries(result.stats)) {
    console.log(`  ${key.padEnd(20)} ${value}`);
  }

  if (result.warnings.length > 0) {
    console.log("\nAvisos:");
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (result.shape) {
    console.log("\nInforme de mapeo de campos:");
    console.log(result.shape.format());
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      `\nError: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => closeDb().catch(() => {}));
