/**
 * Database Operations
 *
 * CRUD operations for publish jobs.
 * Uses Supabase or in-memory store based on configuration.
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import type { PublishJob, PublishStatus } from './types';

// --- In-memory fallback store (for local dev without Supabase) ---

const inMemoryJobs = new Map<string, PublishJob>();

/**
 * Create a new publish job
 */
export async function createPublishJob(params: {
  appId: number;
  appName?: string;
  profileId?: string;
  bundleHash: string;
  bundleSize: number;
}): Promise<PublishJob> {
  const job: PublishJob = {
    id: uuidv4(),
    status: 'queued',
    app_id: params.appId,
    app_name: params.appName || null,
    profile_id: params.profileId || null,
    bundle_hash: params.bundleHash,
    bundle_size: params.bundleSize,
    bundle_path: null,
    vercel_deployment_id: null,
    vercel_project_id: null,
    url: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('publish_jobs')
      .insert(job)
      .select()
      .single();

    if (error) {
      console.error('[db] Failed to create publish job:', error);
      throw new Error(`Failed to create publish job: ${error.message}`);
    }

    return data as PublishJob;
  }

  // In-memory fallback
  inMemoryJobs.set(job.id, job);
  return job;
}

/**
 * Get a publish job by ID
 */
export async function getPublishJob(publishId: string): Promise<PublishJob | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('publish_jobs')
      .select('*')
      .eq('id', publishId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      console.error('[db] Failed to get publish job:', error);
      throw new Error(`Failed to get publish job: ${error.message}`);
    }

    return data as PublishJob;
  }

  // In-memory fallback
  return inMemoryJobs.get(publishId) || null;
}

/**
 * Update a publish job
 */
export async function updatePublishJob(
  publishId: string,
  updates: Partial<Omit<PublishJob, 'id' | 'created_at'>>
): Promise<PublishJob | null> {
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('publish_jobs')
      .update(updateData)
      .eq('id', publishId)
      .select()
      .single();

    if (error) {
      console.error('[db] Failed to update publish job:', error);
      throw new Error(`Failed to update publish job: ${error.message}`);
    }

    return data as PublishJob;
  }

  // In-memory fallback
  const job = inMemoryJobs.get(publishId);
  if (!job) {
    return null;
  }

  const updatedJob = { ...job, ...updateData };
  inMemoryJobs.set(publishId, updatedJob);
  return updatedJob;
}

/**
 * Update job status with optional fields
 */
export async function updateJobStatus(
  publishId: string,
  status: PublishStatus,
  extra?: { url?: string; error?: string; vercel_deployment_id?: string; vercel_project_id?: string; bundle_path?: string }
): Promise<PublishJob | null> {
  return updatePublishJob(publishId, {
    status,
    ...extra,
  });
}

/**
 * Delete old jobs (cleanup)
 */
export async function deleteOldJobs(olderThanHours: number = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('publish_jobs')
      .delete()
      .lt('created_at', cutoff)
      .select('id');

    if (error) {
      console.error('[db] Failed to delete old jobs:', error);
      return 0;
    }

    return data?.length || 0;
  }

  // In-memory fallback
  let deleted = 0;
  for (const [id, job] of inMemoryJobs.entries()) {
    if (job.created_at < cutoff) {
      inMemoryJobs.delete(id);
      deleted++;
    }
  }
  return deleted;
}

/**
 * Clear in-memory store for testing
 */
export function clearInMemoryStoreForTesting(): void {
  inMemoryJobs.clear();
}
