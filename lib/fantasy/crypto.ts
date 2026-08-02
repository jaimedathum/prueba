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
      'Falta TOKEN_ENCRYPTION_KEY. Genérala con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY debe tener ${KEY_BYTES} bytes en hex (${KEY_BYTES * 2} caracteres), tiene ${key.length}`,
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
