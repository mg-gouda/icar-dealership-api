import { createHmac, randomBytes } from 'crypto';

// RFC 6238 TOTP — no external deps
const STEP = 30; // seconds
const DIGITS = 6;

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0,
    val = 0;
  const out: number[] = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    val = (val << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', key).update(msg).digest();
  const offset = hash[hash.length - 1] & 0xf;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    (hash[offset + 1] << 16) |
    (hash[offset + 2] << 8) |
    hash[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function generateSecret(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return Array.from(randomBytes(20))
    .map((b) => alphabet[b % 32])
    .join('');
}

export function verifyTotp(secret: string, token: string, skew = 1): boolean {
  const t = Math.floor(Date.now() / 1000 / STEP);
  for (let i = -skew; i <= skew; i++) {
    if (hotp(secret, t + i) === token) return true;
  }
  return false;
}

export function totpUri(
  secret: string,
  email: string,
  issuer = 'iCar Admin',
): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}
