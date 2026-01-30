/**
 * Database Operations Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPublishJob,
  getPublishJob,
  updatePublishJob,
  updateJobStatus,
  clearInMemoryStoreForTesting,
} from './db';

// Mock Supabase to use in-memory store
vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => false,
  getSupabaseClient: () => null,
}));

describe('db (in-memory)', () => {
  beforeEach(() => {
    clearInMemoryStoreForTesting();
  });

  describe('createPublishJob', () => {
    it('creates a job with required fields', async () => {
      const job = await createPublishJob({
        appId: 123,
        bundleHash: 'abc123',
        bundleSize: 1024,
      });

      expect(job.id).toBeDefined();
      expect(job.app_id).toBe(123);
      expect(job.bundle_hash).toBe('abc123');
      expect(job.bundle_size).toBe(1024);
      expect(job.status).toBe('queued');
      expect(job.created_at).toBeDefined();
    });

    it('creates a job with optional fields', async () => {
      const job = await createPublishJob({
        appId: 456,
        bundleHash: 'def456',
        bundleSize: 2048,
        appName: 'My App',
        profileId: 'user-123',
      });

      expect(job.app_name).toBe('My App');
      expect(job.profile_id).toBe('user-123');
    });
  });

  describe('getPublishJob', () => {
    it('returns job by ID', async () => {
      const created = await createPublishJob({
        appId: 789,
        bundleHash: 'ghi789',
        bundleSize: 512,
      });

      const retrieved = await getPublishJob(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    it('returns null for non-existent ID', async () => {
      const retrieved = await getPublishJob('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('updatePublishJob', () => {
    it('updates job fields', async () => {
      const job = await createPublishJob({
        appId: 111,
        bundleHash: 'hash111',
        bundleSize: 100,
      });

      const updated = await updatePublishJob(job.id, {
        status: 'building',
        vercel_deployment_id: 'dpl_123',
      });

      expect(updated?.status).toBe('building');
      expect(updated?.vercel_deployment_id).toBe('dpl_123');
    });

    it('updates updated_at timestamp', async () => {
      const job = await createPublishJob({
        appId: 222,
        bundleHash: 'hash222',
        bundleSize: 200,
      });

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await updatePublishJob(job.id, {
        status: 'deploying',
      });

      expect(updated?.updated_at).not.toBe(job.updated_at);
    });
  });

  describe('updateJobStatus', () => {
    it('updates status with extras', async () => {
      const job = await createPublishJob({
        appId: 333,
        bundleHash: 'hash333',
        bundleSize: 300,
      });

      await updateJobStatus(job.id, 'ready', {
        url: 'https://my-app.vercel.app',
      });

      const retrieved = await getPublishJob(job.id);
      expect(retrieved?.status).toBe('ready');
      expect(retrieved?.url).toBe('https://my-app.vercel.app');
    });

    it('updates status with error', async () => {
      const job = await createPublishJob({
        appId: 444,
        bundleHash: 'hash444',
        bundleSize: 400,
      });

      await updateJobStatus(job.id, 'failed', {
        error: 'Deployment failed',
      });

      const retrieved = await getPublishJob(job.id);
      expect(retrieved?.status).toBe('failed');
      expect(retrieved?.error).toBe('Deployment failed');
    });
  });
});
