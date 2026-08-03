/**
 * Envío por Telegram.
 *
 * Se eligió Telegram y no notificaciones web porque llega al móvil sin
 * permisos del navegador, funciona igual en cualquier dispositivo y se
 * implementa en una tarde. El mensaje va a tu propio chat: la app no publica
 * nada en ningún sitio.
 */

const API_BASE = "https://api.telegram.org";

export class TelegramNotConfiguredError extends Error {
  constructor() {
    super(
      "Faltan TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID. Habla con @BotFather para " +
        "crear el bot y escríbele una vez para obtener tu chat id.",
    );
    this.name = "TelegramNotConfiguredError";
  }
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

export interface SendOptions {
  fetchImpl?: typeof fetch;
  config?: TelegramConfig;
}

export async function sendTelegramMessage(
  text: string,
  options: SendOptions = {},
): Promise<void> {
  const config = options.config ?? getTelegramConfig();
  if (!config) throw new TelegramNotConfiguredError();

  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(
    `${API_BASE}/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Telegram respondió ${response.status}: ${detail}`);
  }
}
