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

/**
 * Caracteres que MarkdownV2 reserva. Telegram exige escapar **todos** los que
 * aparezcan en el texto, incluso donde no podrían formar marcado: si se queda
 * uno sin escapar, la API responde 400 y el mensaje entero se pierde.
 *
 * La lista sale de la documentación de Telegram y es cerrada, que es
 * justamente lo que el `Markdown` legacy no ofrecía.
 */
const MARKDOWN_V2_RESERVED = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_RESERVED, (char) => `\\${char}`);
}

export interface SendOptions {
  fetchImpl?: typeof fetch;
  config?: TelegramConfig;
  /**
   * Por defecto se manda sin marcado: es lo seguro para un texto cualquiera.
   * Quien quiera negritas manda `"MarkdownV2"` y se ocupa de escapar con
   * `escapeMarkdownV2`.
   */
  parseMode?: "MarkdownV2";
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
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Telegram respondió ${response.status}: ${detail}`);
  }
}
