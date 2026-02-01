/**
 * Publish Status Endpoint
 *
 * GET /api/v1/publish/status?publishId=...
 * Returns current status of a publish operation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getPublishJob } from '@/lib/db';
import { getStatusProgress, getStatusMessage, isTerminalStatus } from '@/lib/types';
import { getDeploymentStatus } from '@/lib/vercel';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitError = checkRateLimit(request);
  if (rateLimitError) return rateLimitError;

  // Check auth
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    // Get publishId from query params
    const publishId = request.nextUrl.searchParams.get('publishId');
    if (!publishId) {
      return NextResponse.json({ error: 'Missing publishId query parameter' }, { status: 400 });
    }

    // Get job
    const job = await getPublishJob(publishId);
    if (!job) {
      return NextResponse.json({ error: 'Publish job not found' }, { status: 404 });
    }

    // If job has a Vercel deployment and is not in a terminal state,
    // check the deployment status (the background poller may have updated it)
    let status = job.status;
    let url = job.url;
    let error = job.error;

    // For terminal states, just return the stored values
    if (isTerminalStatus(status)) {
      return NextResponse.json({
        status,
        progress: getStatusProgress(status),
        message: getStatusMessage(status),
        url: url || undefined,
        error: error || undefined,
      });
    }

    // For in-progress states, optionally check Vercel directly
    // (the background poller should keep the DB updated, but this provides freshness)
    if (job.vercel_deployment_id && ['building', 'deploying'].includes(status)) {
      try {
        const vercelStatus = await getDeploymentStatus(job.vercel_deployment_id);

        // Map Vercel status to our status
        switch (vercelStatus.readyState) {
          case 'READY':
            status = 'ready';
            url = vercelStatus.url;
            break;
          case 'ERROR':
            status = 'failed';
            error = vercelStatus.errorMessage || 'Deployment failed';
            break;
          case 'CANCELED':
            status = 'cancelled';
            break;
          case 'BUILDING':
            status = 'building';
            break;
          // QUEUED - keep current status
        }
      } catch (vercelError) {
        // If we can't check Vercel, return the cached status
        console.warn('[publish:status] Failed to check Vercel status:', vercelError);
      }
    }

    return NextResponse.json({
      status,
      progress: getStatusProgress(status),
      message: getStatusMessage(status),
      url: url || undefined,
      error: error || undefined,
    });
  } catch (error) {
    console.error('[publish:status] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
