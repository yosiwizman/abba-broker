/**
 * Vercel Deployment Service
 *
 * Handles deploying app bundles to Vercel using the Deployments API.
 * Uploads files directly and creates deployments.
 */

import { updateJobStatus } from './db';
import { redactSensitiveInfo } from './auth';

const VERCEL_API_URL = 'https://api.vercel.com';
const VERCEL_TOKEN = process.env.BROKER_VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

/**
 * Check if Vercel is configured
 */
export function isVercelConfigured(): boolean {
  return !!VERCEL_TOKEN;
}

/**
 * Generate Vercel API URL with optional team ID
 */
function apiUrl(path: string): string {
  const base = `${VERCEL_API_URL}${path}`;
  if (VERCEL_TEAM_ID) {
    const separator = path.includes('?') ? '&' : '?';
    return `${base}${separator}teamId=${VERCEL_TEAM_ID}`;
  }
  return base;
}

/**
 * Make a request to Vercel API
 */
async function vercelFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!VERCEL_TOKEN) {
    throw new Error('BROKER_VERCEL_TOKEN not configured');
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return response;
}

/**
 * Deployment file structure for Vercel API
 */
export interface DeploymentFile {
  file: string; // Path within the deployment
  data: string; // File content (base64 for binary)
  encoding?: 'base64';
}

/**
 * Create a new Vercel deployment with files
 */
export async function createDeployment(
  projectName: string,
  files: DeploymentFile[]
): Promise<{
  id: string;
  url: string;
  readyState: string;
}> {
  console.log(`[vercel] Creating deployment for project: ${projectName}`);
  console.log(`[vercel] Files to deploy: ${files.length}`);

  // First, ensure project exists or create it
  const project = await ensureProject(projectName);
  console.log(`[vercel] Using project: ${project.id}`);

  // Create deployment using v13 deployments API
  const response = await vercelFetch('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      project: project.id,
      files: files.map((f) => ({
        file: f.file,
        data: f.data,
        encoding: f.encoding,
      })),
      projectSettings: {
        framework: null, // Static deployment
        buildCommand: null,
        outputDirectory: null,
      },
      target: 'production',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[vercel] Deployment creation failed:', redactSensitiveInfo(error));
    throw new Error(`Failed to create deployment: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[vercel] Deployment created: ${data.id}, state: ${data.readyState}`);

  return {
    id: data.id,
    url: `https://${data.url}`,
    readyState: data.readyState,
  };
}

/**
 * Ensure a Vercel project exists, create if not
 */
async function ensureProject(
  name: string
): Promise<{ id: string; name: string }> {
  // Try to get existing project
  const getResponse = await vercelFetch(`/v9/projects/${encodeURIComponent(name)}`);

  if (getResponse.ok) {
    const project = await getResponse.json();
    return { id: project.id, name: project.name };
  }

  if (getResponse.status !== 404) {
    const error = await getResponse.text();
    throw new Error(`Failed to get project: ${redactSensitiveInfo(error)}`);
  }

  // Create new project
  console.log(`[vercel] Creating new project: ${name}`);
  const createResponse = await vercelFetch('/v10/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      framework: null,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create project: ${redactSensitiveInfo(error)}`);
  }

  const project = await createResponse.json();
  return { id: project.id, name: project.name };
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(
  deploymentId: string
): Promise<{
  readyState: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  url: string | null;
  errorMessage?: string;
}> {
  const response = await vercelFetch(`/v13/deployments/${deploymentId}`);

  if (!response.ok) {
    throw new Error(`Failed to get deployment: ${response.status}`);
  }

  const data = await response.json();

  return {
    readyState: data.readyState,
    url: data.url ? `https://${data.url}` : null,
    errorMessage: data.errorMessage,
  };
}

/**
 * Cancel a deployment
 */
export async function cancelDeployment(deploymentId: string): Promise<boolean> {
  const response = await vercelFetch(`/v13/deployments/${deploymentId}/cancel`, {
    method: 'PATCH',
  });

  return response.ok;
}

/**
 * Generate a project name for an app
 */
export function generateProjectName(appId: number, bundleHash: string): string {
  const shortHash = bundleHash.slice(0, 8);
  return `abba-app-${appId}-${shortHash}`;
}

/**
 * Deploy a bundle (extracted files) to Vercel
 *
 * This is the main entry point for deploying an app.
 */
export async function deployBundle(
  publishId: string,
  appId: number,
  bundleHash: string,
  files: DeploymentFile[]
): Promise<{ deploymentId: string; projectId: string }> {
  const projectName = generateProjectName(appId, bundleHash);

  // Update status to deploying
  await updateJobStatus(publishId, 'deploying');

  try {
    const deployment = await createDeployment(projectName, files);

    // Get the project ID from the deployment
    const projectResponse = await vercelFetch(`/v9/projects/${encodeURIComponent(projectName)}`);
    const project = await projectResponse.json();

    return {
      deploymentId: deployment.id,
      projectId: project.id,
    };
  } catch (error) {
    console.error('[vercel] Deployment failed:', error);
    await updateJobStatus(publishId, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown deployment error',
    });
    throw error;
  }
}

/**
 * Poll deployment until ready or failed
 * Updates job status as deployment progresses
 */
export async function pollDeploymentUntilReady(
  publishId: string,
  deploymentId: string,
  maxWaitMs: number = 300000 // 5 minutes
): Promise<{ success: boolean; url?: string; error?: string }> {
  const startTime = Date.now();
  const pollInterval = 3000; // 3 seconds

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await getDeploymentStatus(deploymentId);

      console.log(`[vercel] Deployment ${deploymentId} state: ${status.readyState}`);

      switch (status.readyState) {
        case 'READY':
          await updateJobStatus(publishId, 'ready', {
            url: status.url || undefined,
          });
          return { success: true, url: status.url || undefined };

        case 'ERROR':
          await updateJobStatus(publishId, 'failed', {
            error: status.errorMessage || 'Deployment failed',
          });
          return { success: false, error: status.errorMessage };

        case 'CANCELED':
          await updateJobStatus(publishId, 'cancelled');
          return { success: false, error: 'Deployment was cancelled' };

        case 'BUILDING':
          // Update to building if not already
          await updateJobStatus(publishId, 'building');
          break;

        case 'QUEUED':
        default:
          // Keep waiting
          break;
      }
    } catch (error) {
      console.error('[vercel] Error polling deployment:', error);
      // Continue polling on transient errors
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout
  await updateJobStatus(publishId, 'failed', {
    error: 'Deployment timed out after 5 minutes',
  });
  return { success: false, error: 'Deployment timed out' };
}
