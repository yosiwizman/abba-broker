/**
 * Broker Types and Schemas
 *
 * Defines the contract for the ABBA Broker API.
 * Must match the desktop client's expectations.
 */

import { z } from 'zod';

// --- Publish Status ---

export const PublishStatusEnum = z.enum([
  'queued',
  'packaging',
  'uploading',
  'building',
  'deploying',
  'ready',
  'failed',
  'cancelled',
]);

export type PublishStatus = z.infer<typeof PublishStatusEnum>;

// --- Terminal states ---
export const TERMINAL_STATUSES: PublishStatus[] = ['ready', 'failed', 'cancelled'];

export function isTerminalStatus(status: PublishStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// --- Publish Start Request/Response ---

export const PublishStartRequestSchema = z.object({
  /** The app ID being published */
  appId: z.number(),
  /** SHA256 hash of the bundle for integrity */
  bundleHash: z.string(),
  /** Size of the bundle in bytes */
  bundleSize: z.number(),
  /** Profile ID of the user publishing */
  profileId: z.string().optional(),
  /** Optional app name for display */
  appName: z.string().optional(),
});

export type PublishStartRequest = z.infer<typeof PublishStartRequestSchema>;

export const PublishStartResponseSchema = z.object({
  /** Unique identifier for this publish operation */
  publishId: z.string(),
  /** Initial status */
  status: PublishStatusEnum,
  /** Upload URL for the bundle */
  uploadUrl: z.string().optional(),
});

export type PublishStartResponse = z.infer<typeof PublishStartResponseSchema>;

// --- Publish Upload ---

export const PublishUploadQuerySchema = z.object({
  publishId: z.string(),
});

export type PublishUploadQuery = z.infer<typeof PublishUploadQuerySchema>;

// --- Publish Complete Request ---

export const PublishCompleteRequestSchema = z.object({
  publishId: z.string(),
});

export type PublishCompleteRequest = z.infer<typeof PublishCompleteRequestSchema>;

// --- Publish Status Request/Response ---

export const PublishStatusQuerySchema = z.object({
  publishId: z.string(),
});

export type PublishStatusQuery = z.infer<typeof PublishStatusQuerySchema>;

export const PublishStatusResponseSchema = z.object({
  /** Current status of the publish */
  status: PublishStatusEnum,
  /** Live URL when ready */
  url: z.string().optional(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Progress percentage (0-100) */
  progress: z.number().optional(),
  /** Human-readable status message */
  message: z.string().optional(),
});

export type PublishStatusResponse = z.infer<typeof PublishStatusResponseSchema>;

// --- Publish Cancel Request/Response ---

export const PublishCancelRequestSchema = z.object({
  publishId: z.string(),
});

export type PublishCancelRequest = z.infer<typeof PublishCancelRequestSchema>;

export const PublishCancelResponseSchema = z.object({
  /** Whether the cancel was successful */
  success: z.boolean(),
  /** Final status after cancellation */
  status: PublishStatusEnum,
});

export type PublishCancelResponse = z.infer<typeof PublishCancelResponseSchema>;

// --- Database Types ---

export interface PublishJob {
  id: string;
  status: PublishStatus;
  app_id: number;
  app_name: string | null;
  profile_id: string | null;
  bundle_hash: string;
  bundle_size: number;
  bundle_path: string | null;
  vercel_deployment_id: string | null;
  vercel_project_id: string | null;
  url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// --- Progress Calculation ---

const STATUS_PROGRESS: Record<PublishStatus, number> = {
  queued: 5,
  packaging: 15,
  uploading: 35,
  building: 60,
  deploying: 85,
  ready: 100,
  failed: 0,
  cancelled: 0,
};

export function getStatusProgress(status: PublishStatus): number {
  return STATUS_PROGRESS[status];
}

export function getStatusMessage(status: PublishStatus): string {
  switch (status) {
    case 'queued':
      return 'Preparing to publish...';
    case 'packaging':
      return 'Processing bundle...';
    case 'uploading':
      return 'Uploading to Vercel...';
    case 'building':
      return 'Building for production...';
    case 'deploying':
      return 'Deploying to ABBA hosting...';
    case 'ready':
      return 'Your app is live!';
    case 'failed':
      return 'Publish failed';
    case 'cancelled':
      return 'Publish cancelled';
  }
}
