import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

/**
 * CryptoService unit tests. The 32-byte key is injected via a stub
 * ConfigService so we can assert deterministic encryption output.
 */
describe('CryptoService', () => {
  let crypto: CryptoService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CryptoService,
        { provide: ConfigService, useValue: { get: () => 'a'.repeat(32) } },
      ],
    }).compile();
    crypto = moduleRef.get(CryptoService);
  });

  describe('encrypt + decrypt round-trip', () => {
    it('decrypts the blob produced by encrypt', () => {
      const blob = crypto.encrypt('13800138000');
      expect(crypto.decrypt(blob)).toBe('13800138000');
    });

    it('produces a different ciphertext each call (random IV)', () => {
      const a = crypto.encrypt('hello');
      const b = crypto.encrypt('hello');
      expect(a).not.toBe(b);
    });

    it('blob is `iv.ciphertext.authTag` (3 base64 parts)', () => {
      const blob = crypto.encrypt('hi');
      const parts = blob.split('.');
      expect(parts).toHaveLength(3);
      // IV is 12 bytes → 16 base64 chars (with padding).
      expect(parts[0]).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });

  describe('decrypt tampering', () => {
    it('throws when the auth tag is modified', () => {
      const blob = crypto.encrypt('secret');
      const [iv, enc, tag] = blob.split('.');
      // Flip a byte in the middle of the auth tag (not the padding char).
      const tagArr = tag.split('');
      const midIdx = Math.floor(tagArr.length / 2);
      tagArr[midIdx] = tagArr[midIdx] === 'A' ? 'B' : 'A';
      const tampered = [iv, enc, tagArr.join('')].join('.');
      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it('throws when the ciphertext is modified', () => {
      const blob = crypto.encrypt('secret');
      const [iv, enc, tag] = blob.split('.');
      // Flip a byte in the middle of the ciphertext.
      const encArr = enc.split('');
      const midIdx = Math.floor(encArr.length / 2);
      encArr[midIdx] = encArr[midIdx] === 'A' ? 'B' : 'A';
      const tampered = [iv, encArr.join(''), tag].join('.');
      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it('throws on malformed blob (not 3 parts)', () => {
      expect(() => crypto.decrypt('only-one-part')).toThrow();
    });
  });

  describe('hashPhone', () => {
    it('is deterministic (same input → same hash)', () => {
      expect(crypto.hashPhone('13800138000')).toBe(crypto.hashPhone('13800138000'));
    });
    it('produces a 64-char hex string (SHA-256)', () => {
      expect(crypto.hashPhone('13800138000')).toMatch(/^[a-f0-9]{64}$/);
    });
    it('different inputs produce different hashes', () => {
      expect(crypto.hashPhone('13800138000')).not.toBe(crypto.hashPhone('13800138001'));
    });
  });

  describe('maskPhone', () => {
    it('masks 11-digit CN mobile as `138****8000`', () => {
      expect(crypto.maskPhone('13800138000')).toBe('138****8000');
    });
    it('returns `****` for too-short input', () => {
      expect(crypto.maskPhone('12345')).toBe('****');
    });
  });
});
