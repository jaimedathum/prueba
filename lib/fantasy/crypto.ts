import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Cifrado del refresh token en reposo (AES-256-GCM).
 *
 * La contraseña de la cuenta nunca se guarda: se usa una vez para el login
 * inicial y a partir de ahí solo vive el refresh token, cifrado.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "Falta TOKEN_ENCRYPTION_KEY: el servidor no la ve.\n\n" +
        "Si crees que sí está configurada, casi siempre es una de estas dos: " +
        "se añadió después del último despliegue (las variables de entorno " +
        "solo entran en builds nuevos, hay que redesplegar), o no está " +
        "marcada para este entorno (una variable solo de Production no existe " +
        "en la URL de preview).\n\n" +
        "Para generar una: en la consola del navegador, " +
        "crypto.randomUUID().replaceAll('-','').repeat(2) — o con Node, " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY debe tener ${KEY_BYTES} bytes en hex ` +
        `(${KEY_BYTES * 2} caracteres hexadecimales), y la que hay son ${key.length} bytes. ` +
        "Revisa que no lleve comillas ni espacios de más.",
    );
  }
  return key;
}

export function encryptToken(plaintext: string): EncryptedPayload {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptToken(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Comparación en tiempo constante para el secreto del cron. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
