/**
 * Auth Middleware Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { constantTimeCompare, validateDeviceToken } from './auth';

describe('auth', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('constantTimeCompare', () => {
    it('returns true for identical strings', () => {
      expect(constantTimeCompare('hello', 'hello')).toBe(true);
      expect(constantTimeCompare('test-token-123', 'test-token-123')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(constantTimeCompare('hello', 'world')).toBe(false);
      expect(constantTimeCompare('test', 'testing')).toBe(false);
    });

    it('returns false for strings of different lengths', () => {
      expect(constantTimeCompare('short', 'much-longer-string')).toBe(false);
      expect(constantTimeCompare('', 'nonempty')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(constantTimeCompare('', '')).toBe(true);
    });

    it('handles special characters', () => {
      expect(constantTimeCompare('token-with-special!@#$', 'token-with-special!@#$')).toBe(true);
      expect(constantTimeCompare('token-with-special!@#$', 'token-with-special!@#%')).toBe(false);
    });
  });

  describe('validateDeviceToken', () => {
    it('returns false when ABBA_DEVICE_TOKEN is not configured', () => {
      delete process.env.ABBA_DEVICE_TOKEN;
      // We need to re-import to pick up the new env
      const { validateDeviceToken: validate } = require('./auth');
      expect(validate('any-token')).toBe(false);
    });

    it('returns false for null token', () => {
      process.env.ABBA_DEVICE_TOKEN = 'secret-token';
      const { validateDeviceToken: validate } = require('./auth');
      expect(validate(null)).toBe(false);
    });

    it('returns false for incorrect token', () => {
      process.env.ABBA_DEVICE_TOKEN = 'correct-token';
      const { validateDeviceToken: validate } = require('./auth');
      expect(validate('wrong-token')).toBe(false);
    });

    it('returns true for correct token', () => {
      process.env.ABBA_DEVICE_TOKEN = 'my-secret-token';
      const { validateDeviceToken: validate } = require('./auth');
      expect(validate('my-secret-token')).toBe(true);
    });
  });
});
