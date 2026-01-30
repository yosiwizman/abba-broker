/**
 * Bundle Processing Tests
 */

import { describe, it, expect } from 'vitest';
import { computeHash, validateBundleSize } from './bundle';

describe('bundle', () => {
  describe('computeHash', () => {
    it('computes SHA256 hash', () => {
      const buffer = Buffer.from('hello world');
      const hash = computeHash(buffer);

      // SHA256 of 'hello world'
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('produces different hashes for different content', () => {
      const hash1 = computeHash(Buffer.from('content1'));
      const hash2 = computeHash(Buffer.from('content2'));

      expect(hash1).not.toBe(hash2);
    });

    it('produces consistent hashes', () => {
      const content = 'same content';
      const hash1 = computeHash(Buffer.from(content));
      const hash2 = computeHash(Buffer.from(content));

      expect(hash1).toBe(hash2);
    });
  });

  describe('validateBundleSize', () => {
    it('accepts valid sizes', () => {
      expect(validateBundleSize(1024).valid).toBe(true);
      expect(validateBundleSize(1024 * 1024).valid).toBe(true); // 1MB
      expect(validateBundleSize(50 * 1024 * 1024).valid).toBe(true); // 50MB (exactly at limit)
    });

    it('rejects oversized bundles', () => {
      const result = validateBundleSize(51 * 1024 * 1024); // 51MB
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('accepts zero size', () => {
      expect(validateBundleSize(0).valid).toBe(true);
    });
  });
});
