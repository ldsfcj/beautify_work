import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption + SHA-256 hashing for at-rest PII (phone numbers).
 *
 * - `encrypt(plaintext)` → `iv.ciphertext.authTag` (base64url-safe), 3-part string
 * - `decrypt(blob)` → original plaintext (throws on tampering — GCM auth tag)
 * - `hashPhone(phone)` → deterministic 64-char hex digest, used as DB lookup key
 * - `maskPhone(phone)` → `138****8000` style display mask
 *
 * Key handling: `FIELD_ENCRYPT_KEY` env is a 32-byte raw key. We accept
 * either raw 32 bytes or a base64-encoded 32-byte value. Tests pin a known
 * 32-byte buffer so encrypt/decrypt is deterministic across runs.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('encrypt.key') ?? '';
    let key: Buffer;
    if (raw.length === 32) {
      key = Buffer.from(raw, 'utf8');
    } else {
      // Try base64 → 32 bytes; otherwise hash to length-32 deterministically.
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 32) {
        key = decoded;
      } else {
        key = createHash('sha256').update(raw).digest();
      }
    }
    if (key.length !== 32) {
      throw new Error(`FIELD_ENCRYPT_KEY must resolve to 32 bytes; got ${key.length}`);
    }
    this.key = key;
  }

  /** Encrypt with a fresh random 12-byte IV. Returns `iv.ciphertext.authTag`. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, enc, authTag].map((b) => b.toString('base64')).join('.');
  }

  /**
   * Decrypt the blob produced by `encrypt`. Throws if the auth tag does not
   * verify (i.e. the blob was tampered with or wrong key).
   */
  decrypt(blob: string): string {
    const parts = blob.split('.');
    if (parts.length !== 3) {
      throw new Error('invalid ciphertext format');
    }
    const [ivB64, encB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }

  /** SHA-256 hex digest. Used as the lookup key for users.phone_hash. */
  hashPhone(phone: string): string {
    return createHash('sha256').update(phone).digest('hex');
  }

  /** Display mask: `138****8000`. */
  maskPhone(phone: string): string {
    if (phone.length < 7) return '****';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}
