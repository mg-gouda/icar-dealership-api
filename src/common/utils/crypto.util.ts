import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.TOTP_ENCRYPTION_KEY ?? '';

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('TOTP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

// ponytail: format = iv(12):tag(16):ciphertext, all hex-encoded
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ponytail: graceful fallback for pre-encryption plaintext secrets (no `:` separator)
export function decryptSecret(stored: string): string {
  if (!stored.includes(':')) return stored;
  const key = getKey();
  const [ivHex, tagHex, ctHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct).toString('utf8') + decipher.final('utf8');
}
