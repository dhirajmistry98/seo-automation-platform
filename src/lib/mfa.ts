import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function encodeBase32(bytes: Buffer) {
  let bits = 0; let value = 0; let output = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function decodeBase32(input: string) {
  let bits = 0; let value = 0; const output: number[] = [];
  for (const char of input.toUpperCase().replace(/=|\s/g, "")) { const digit = alphabet.indexOf(char); if (digit < 0) throw new Error("Invalid authenticator secret."); value = (value << 5) | digit; bits += 5; if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(output);
}
function encryptionKey() {
  const encoded = process.env.MFA_ENCRYPTION_KEY;
  if (!encoded) throw new Error("MFA_ENCRYPTION_KEY is required to store authenticator secrets.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}
export function createTotpSecret() { return encodeBase32(randomBytes(20)); }
export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
export function decryptTotpSecret(encrypted: string) {
  const [iv, tag, ciphertext] = encrypted.split("."); if (!iv || !tag || !ciphertext) throw new Error("Stored authenticator secret is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
function totp(secret: string, time: number) {
  const counter = BigInt(Math.floor(time / 30_000)); const message = Buffer.alloc(8); message.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest(); const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const given = Buffer.from(code);
  for (const skew of [-1, 0, 1]) { const expected = Buffer.from(totp(secret, now + skew * 30_000)); if (timingSafeEqual(given, expected)) return true; }
  return false;
}
export function createRecoveryCodes(count = 10) { return Array.from({ length: count }, () => randomBytes(5).toString("hex").toUpperCase()); }
export function hashRecoveryCode(code: string) { return createHash("sha256").update(code.replace(/[^A-Z0-9]/gi, "").toUpperCase()).digest("hex"); }
