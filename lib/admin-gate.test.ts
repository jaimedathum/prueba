import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_TTL_SECONDS,
  checkAdminSecret,
  signSession,
  verifySession,
} from "./admin-gate";

const KEY = "un-secreto-suficientemente-largo";

describe("signSession / verifySession", () => {
  it("acepta una sesión recién firmada", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(now + 1000, KEY);
    expect(verifySession(cookie, KEY, now)).toBe(true);
  });

  it("rechaza una sesión caducada", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(now - 1, KEY);
    expect(verifySession(cookie, KEY, now)).toBe(false);
  });

  it("rechaza la firmada con otra clave", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(now + 1000, "otra-clave-distinta");
    expect(verifySession(cookie, KEY, now)).toBe(false);
  });

  /**
   * El caso que justifica firmar en vez de guardar la fecha a secas: sin HMAC
   * bastaría con editar la cookie para no caducar nunca.
   */
  it("rechaza una caducidad manipulada", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(now + 1000, KEY);
    const mac = cookie.slice(cookie.indexOf(".") + 1);
    const forjada = `${now + 999_999_999}.${mac}`;

    expect(verifySession(forjada, KEY, now)).toBe(false);
  });

  it("rechaza basura sin reventar", () => {
    const now = 1_700_000_000_000;
    for (const basura of ["", ".", "sin-punto", ".solomac", "abc.def", "1700000000000."]) {
      expect(verifySession(basura, KEY, now)).toBe(false);
    }
  });

  it("no da por buena una firma más corta que la esperada", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(now + 1000, KEY);
    const recortada = cookie.slice(0, cookie.length - 4);
    expect(verifySession(recortada, KEY, now)).toBe(false);
  });

  it("la sesión dura lo declarado", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(now + SESSION_TTL_SECONDS * 1000, KEY);

    const casiAlFinal = now + SESSION_TTL_SECONDS * 1000 - 1;
    expect(verifySession(cookie, KEY, casiAlFinal)).toBe(true);
    expect(verifySession(cookie, KEY, now + SESSION_TTL_SECONDS * 1000)).toBe(false);
  });
});

describe("checkAdminSecret", () => {
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("acepta el secreto correcto", () => {
    process.env.CRON_SECRET = KEY;
    expect(checkAdminSecret(KEY)).toEqual({ ok: true });
  });

  it("rechaza el incorrecto sin decir por qué", () => {
    process.env.CRON_SECRET = KEY;
    const result = checkAdminSecret("otra-cosa");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe("Secreto incorrecto.");
  });

  /** Falla cerrado: sin secreto configurado no se abre, se explica. */
  it("no deja pasar si no hay secreto configurado", () => {
    delete process.env.CRON_SECRET;
    const result = checkAdminSecret("");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("CRON_SECRET");
  });

  it("no deja pasar con cadena vacía aunque coincida con una vacía", () => {
    process.env.CRON_SECRET = "";
    expect(checkAdminSecret("").ok).toBe(false);
  });
});
