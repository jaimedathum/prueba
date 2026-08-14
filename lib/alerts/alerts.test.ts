import { describe, expect, it, vi } from "vitest";
import type { ShieldRecommendation } from "@/lib/engine/clause-defense";
import type { AttackRecommendation } from "@/lib/engine/clause-attack";
import type { MarketCandidate } from "@/lib/engine/market-load";
import type { TransferResult } from "@/lib/engine/transfers";
import { buildAlerts, type DigestInput } from "./digest";
import { selectAlertsToSend } from "./dedupe";
import {
  formatDigest,
  formatDigestMarkdown,
  meetsThreshold,
  sortByPriority,
  type Alert,
} from "./types";
import {
  escapeMarkdownV2,
  sendTelegramMessage,
  TelegramNotConfiguredError,
} from "./telegram";

function shield(overrides: Partial<ShieldRecommendation> = {}): ShieldRecommendation {
  return {
    playerId: "P1",
    name: "Mi crack",
    currentClause: 20_000_000,
    ownValuation: 40_000_000,
    currentRisk: 0.7,
    investment: 5_000_000,
    newClause: 30_000_000,
    newRisk: 0.1,
    expectedGain: 8_000_000,
    costPerRiskAvoided: 100_000,
    verdict: "shield",
    reason: "Invierte 5M y el riesgo baja del 70% al 10%.",
    ...overrides,
  };
}

function attack(overrides: Partial<AttackRecommendation> = {}): AttackRecommendation {
  return {
    playerId: "O1",
    name: "Objetivo",
    ownerManagerId: "rival",
    clause: 10_000_000,
    ownValuation: 20_000_000,
    directSurplus: 10_000_000,
    fundingHarm: 1_000_000,
    netSurplus: 9_000_000,
    verdict: "attack",
    reason: "Ganas 10M menos 1M de exponerte.",
    ...overrides,
  };
}

function candidate(overrides: Partial<MarketCandidate> = {}): MarketCandidate {
  return {
    playerId: "M1",
    name: "Del mercado",
    positionId: 4,
    marketValue: 8_000_000,
    expectedPoints: 6,
    economicRisk: { score: 2, label: "bajo", confident: true },
    sportingRisk: { score: 2, label: "bajo", confident: true },
    reason: "Sale a cuenta.",
    auction: {
      optimalBid: 9_000_000,
      probabilityOfWinning: 0.7,
      expectedSurplus: 3_000_000,
      curve: [],
      activeRivals: ["rival"],
      reason: "Puja 9M: 70% de ganarla.",
      tips: [],
    },
    speculation: {
      playerId: "M1",
      name: "Del mercado",
      maxPrice: 10_000_000,
      expectedExitValue: 10_000_000,
      expectedReturn: 0.25,
      probabilityOfLoss: 0.1,
      verdict: "buy",
      reason: "Fichable hasta 10M.",
    },
    ...overrides,
  };
}

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    today: "2026-08-03",
    shields: [],
    attacks: [],
    transfers: null,
    candidates: [],
    lastSyncFailed: false,
    lastSyncError: null,
    ...overrides,
  };
}

describe("buildAlerts", () => {
  it("sin nada accionable no genera ninguna alerta", () => {
    // Es el caso más importante: la app tiene que saber callarse.
    expect(buildAlerts(input())).toHaveLength(0);
  });

  it("un fallo de sincronización es prioridad alta", () => {
    // Sin datos frescos, todo lo demás que diga la app está calculado sobre
    // información vieja.
    const alerts = buildAlerts(
      input({ lastSyncFailed: true, lastSyncError: "401 no autorizado" }),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.priority).toBe("high");
    expect(alerts[0]!.body).toMatch(/401/);
  });

  it("avisa de un riesgo de cláusula alto", () => {
    const alerts = buildAlerts(input({ shields: [shield()] }));
    expect(alerts[0]!.kind).toBe("clause-risk");
    expect(alerts[0]!.priority).toBe("high");
  });

  it("no interrumpe por un riesgo bajo que puede esperar", () => {
    const alerts = buildAlerts(
      input({ shields: [shield({ currentRisk: 0.15 })] }),
    );
    expect(alerts).toHaveLength(0);
  });

  it("no avisa de blindajes que no compensan", () => {
    const alerts = buildAlerts(
      input({
        shields: [shield({ verdict: "let-them-take-him", investment: null })],
      }),
    );
    expect(alerts).toHaveLength(0);
  });

  it("no avisa de ganancias pequeñas", () => {
    const alerts = buildAlerts(
      input({ attacks: [attack({ netSurplus: 200_000 })] }),
    );
    expect(alerts).toHaveLength(0);
  });

  it("la especulación nunca es urgente", () => {
    // Si se pasa la oportunidad no pasa nada; no merece una interrupción.
    const alerts = buildAlerts(input({ candidates: [candidate()] }));
    const especulacion = alerts.find((a) => a.kind === "speculation")!;

    expect(especulacion.priority).toBe("low");
    expect(meetsThreshold(especulacion.priority)).toBe(false);
  });

  it("la clave de una puja incluye el día, la de un riesgo no", () => {
    // Una puja caduca con el mercado y conviene repetirla; un riesgo de
    // cláusula sigue ahí mañana y no hace falta recordarlo cada día.
    const alerts = buildAlerts(
      input({ candidates: [candidate()], shields: [shield()] }),
    );

    expect(alerts.find((a) => a.kind === "bid")!.key).toContain("2026-08-03");
    expect(alerts.find((a) => a.kind === "clause-risk")!.key).not.toContain(
      "2026-08-03",
    );
  });

  it("la clave de un movimiento identifica la operación, no la fecha", () => {
    const transfers = {
      best: {
        sell: [{ playerId: "A" }],
        buy: [{ playerId: "B" }],
        objective: 5_000_000,
        explanation: "vende A, ficha B",
      },
      alternatives: [],
      cashCostMultiplier: 1,
      evaluated: 10,
    } as unknown as TransferResult;

    const primera = buildAlerts(input({ transfers }));
    const segunda = buildAlerts(input({ transfers, today: "2026-08-04" }));

    // Misma operación, misma clave: no se repite el aviso al día siguiente.
    expect(primera[0]!.key).toBe(segunda[0]!.key);
  });
});

describe("selectAlertsToSend", () => {
  const alerta = (overrides: Partial<Alert> = {}): Alert => ({
    key: "clause-risk:P1",
    kind: "clause-risk",
    priority: "high",
    title: "t",
    body: "b",
    ...overrides,
  });

  it("descarta lo que no llega al umbral de prioridad", () => {
    const seleccion = selectAlertsToSend(
      [alerta({ priority: "low" })],
      new Map(),
    );
    expect(seleccion).toHaveLength(0);
  });

  it("no repite un aviso dentro de su enfriamiento", () => {
    const hace2h = new Date("2026-08-03T10:00:00Z");
    const ahora = new Date("2026-08-03T12:00:00Z");

    const seleccion = selectAlertsToSend(
      [alerta()],
      new Map([["clause-risk:P1", hace2h]]),
      ahora,
    );
    expect(seleccion).toHaveLength(0);
  });

  it("vuelve a avisar cuando pasa el enfriamiento", () => {
    const haceTresDias = new Date("2026-07-31T12:00:00Z");
    const ahora = new Date("2026-08-03T12:00:00Z");

    const seleccion = selectAlertsToSend(
      [alerta()],
      new Map([["clause-risk:P1", haceTresDias]]),
      ahora,
    );
    expect(seleccion).toHaveLength(1);
  });

  it("cada tipo tiene su propio enfriamiento", () => {
    const hace24h = new Date("2026-08-02T12:00:00Z");
    const ahora = new Date("2026-08-03T12:00:00Z");
    const sent = new Map([
      ["bid:M1", hace24h],
      ["clause-risk:P1", hace24h],
    ]);

    const seleccion = selectAlertsToSend(
      [
        alerta({ key: "bid:M1", kind: "bid", priority: "medium" }),
        alerta({ key: "clause-risk:P1" }),
      ],
      sent,
      ahora,
    );

    // La puja se repite a las 20h; el riesgo de cláusula espera 48h.
    expect(seleccion.map((a) => a.kind)).toEqual(["bid"]);
  });

  it("un aviso nuevo se manda siempre", () => {
    expect(selectAlertsToSend([alerta()], new Map())).toHaveLength(1);
  });
});

describe("formatDigest", () => {
  it("pone primero lo más urgente", () => {
    const texto = formatDigest([
      { key: "a", kind: "bid", priority: "medium", title: "Media", body: "b" },
      {
        key: "b",
        kind: "clause-risk",
        priority: "high",
        title: "Urgente",
        body: "b",
      },
    ]);

    expect(texto.indexOf("Urgente")).toBeLessThan(texto.indexOf("Media"));
  });

  it("marca visualmente la prioridad", () => {
    const texto = formatDigest([
      {
        key: "a",
        kind: "clause-risk",
        priority: "high",
        title: "T",
        body: "b",
      },
    ]);
    expect(texto).toContain("🔴");
  });
});

describe("formatDigestMarkdown", () => {
  /**
   * El fallo que justifica todo esto: un nombre con guion bajo hacía que
   * Telegram devolviera 400 y se perdiera la tanda entera, incluido el aviso
   * de que la sincronización había fallado.
   */
  it("escapa los caracteres reservados del contenido", () => {
    const texto = formatDigestMarkdown(
      [
        {
          key: "a",
          kind: "clause-risk",
          priority: "high",
          title: "Riesgo de perder a Fede_Valverde",
          body: "Vale 12.5M (un 30% más).",
        },
      ],
      escapeMarkdownV2,
    );

    expect(texto).toContain("Fede\\_Valverde");
    expect(texto).toContain("12\\.5M");
    expect(texto).toContain("\\(un 30% más\\)");
  });

  it("deja en pie el marcado que sí es nuestro", () => {
    const texto = formatDigestMarkdown(
      [{ key: "a", kind: "bid", priority: "high", title: "Puja", body: "b" }],
      escapeMarkdownV2,
    );

    expect(texto).toContain("*Puja*");
    expect(texto).toContain("🔴");
  });

  it("sigue ordenando por urgencia", () => {
    const texto = formatDigestMarkdown(
      [
        { key: "a", kind: "bid", priority: "medium", title: "Media", body: "b" },
        { key: "b", kind: "clause-risk", priority: "high", title: "Urgente", body: "b" },
      ],
      escapeMarkdownV2,
    );

    expect(texto.indexOf("Urgente")).toBeLessThan(texto.indexOf("Media"));
  });
});

describe("escapeMarkdownV2", () => {
  it("escapa toda la lista reservada de Telegram", () => {
    expect(escapeMarkdownV2("_*[]()~`>#+-=|{}.!")).toBe(
      "\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!",
    );
  });

  it("escapa también la propia barra invertida", () => {
    expect(escapeMarkdownV2("a\\b")).toBe("a\\\\b");
  });

  it("no toca el texto corriente ni los acentos", () => {
    expect(escapeMarkdownV2("Ganó el Atlético 2 a 0")).toBe(
      "Ganó el Atlético 2 a 0",
    );
  });
});

describe("formatDigest", () => {
  /** La versión de texto plano no puede volver a meter marcado. */
  it("no emite marcado", () => {
    const texto = formatDigest([
      { key: "a", kind: "bid", priority: "high", title: "Puja", body: "b" },
    ]);

    expect(texto).not.toContain("*");
    expect(texto).toContain("Puja");
  });
});

describe("sortByPriority", () => {
  it("no muta el array original", () => {
    const original: Alert[] = [
      { key: "a", kind: "bid", priority: "low", title: "1", body: "" },
      { key: "b", kind: "bid", priority: "high", title: "2", body: "" },
    ];
    sortByPriority(original);
    expect(original[0]!.title).toBe("1");
  });
});

describe("sendTelegramMessage", () => {
  const config = { botToken: "token", chatId: "123" };

  it("manda el mensaje al chat configurado", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}"));
    await sendTelegramMessage("hola", { fetchImpl, config });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/bottoken/sendMessage");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      chat_id: "123",
      text: "hola",
    });
  });

  it("explica qué falta si no está configurado", async () => {
    await expect(
      sendTelegramMessage("hola", { config: undefined, fetchImpl: vi.fn() }),
    ).rejects.toBeInstanceOf(TelegramNotConfiguredError);
  });

  it("propaga el error de Telegram con su detalle", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("chat not found", { status: 400 }),
    );

    await expect(
      sendTelegramMessage("hola", { fetchImpl, config }),
    ).rejects.toThrow(/400.*chat not found/);
  });
});
