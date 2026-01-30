/**
 * Types and Status Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isTerminalStatus,
  getStatusProgress,
  getStatusMessage,
  PublishStartRequestSchema,
  PublishStatusResponseSchema,
} from './types';

describe('types', () => {
  describe('isTerminalStatus', () => {
    it('returns true for terminal statuses', () => {
      expect(isTerminalStatus('ready')).toBe(true);
      expect(isTerminalStatus('failed')).toBe(true);
      expect(isTerminalStatus('cancelled')).toBe(true);
    });

    it('returns false for in-progress statuses', () => {
      expect(isTerminalStatus('queued')).toBe(false);
      expect(isTerminalStatus('packaging')).toBe(false);
      expect(isTerminalStatus('uploading')).toBe(false);
      expect(isTerminalStatus('building')).toBe(false);
      expect(isTerminalStatus('deploying')).toBe(false);
    });
  });

  describe('getStatusProgress', () => {
    it('returns 100 for ready status', () => {
      expect(getStatusProgress('ready')).toBe(100);
    });

    it('returns 0 for failed/cancelled', () => {
      expect(getStatusProgress('failed')).toBe(0);
      expect(getStatusProgress('cancelled')).toBe(0);
    });

    it('returns increasing progress for workflow stages', () => {
      const queued = getStatusProgress('queued');
      const packaging = getStatusProgress('packaging');
      const uploading = getStatusProgress('uploading');
      const building = getStatusProgress('building');
      const deploying = getStatusProgress('deploying');

      expect(queued).toBeLessThan(packaging);
      expect(packaging).toBeLessThan(uploading);
      expect(uploading).toBeLessThan(building);
      expect(building).toBeLessThan(deploying);
      expect(deploying).toBeLessThan(100);
    });
  });

  describe('getStatusMessage', () => {
    it('returns appropriate messages for each status', () => {
      expect(getStatusMessage('queued')).toContain('Preparing');
      expect(getStatusMessage('ready')).toContain('live');
      expect(getStatusMessage('failed')).toContain('failed');
    });
  });

  describe('PublishStartRequestSchema', () => {
    it('validates correct request', () => {
      const result = PublishStartRequestSchema.safeParse({
        appId: 123,
        bundleHash: 'abc123def456',
        bundleSize: 1024,
      });
      expect(result.success).toBe(true);
    });

    it('validates request with optional fields', () => {
      const result = PublishStartRequestSchema.safeParse({
        appId: 123,
        bundleHash: 'abc123def456',
        bundleSize: 1024,
        profileId: 'user-123',
        appName: 'My App',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid request', () => {
      const result = PublishStartRequestSchema.safeParse({
        appId: 'not-a-number', // should be number
        bundleHash: 123, // should be string
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      const result = PublishStartRequestSchema.safeParse({
        appId: 123,
        // missing bundleHash and bundleSize
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PublishStatusResponseSchema', () => {
    it('validates minimal response', () => {
      const result = PublishStatusResponseSchema.safeParse({
        status: 'queued',
      });
      expect(result.success).toBe(true);
    });

    it('validates full response', () => {
      const result = PublishStatusResponseSchema.safeParse({
        status: 'ready',
        url: 'https://my-app.vercel.app',
        progress: 100,
        message: 'Your app is live!',
      });
      expect(result.success).toBe(true);
    });

    it('validates error response', () => {
      const result = PublishStatusResponseSchema.safeParse({
        status: 'failed',
        error: 'Deployment failed',
        progress: 0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = PublishStatusResponseSchema.safeParse({
        status: 'invalid-status',
      });
      expect(result.success).toBe(false);
    });
  });
});
