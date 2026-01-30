/**
 * Publish Cancel Endpoint
 *
 * POST /api/v1/publish/cancel
 * Cancels an in-progress publish operation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getPublishJob, updateJobStatus } from '@/lib/db';
import { PublishCancelRequestSchema, isTerminalStatus } from '@/lib/types';
import { cancelDeployment } from '@/lib/vercel';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitError = checkRateLimit(request);
  if (rateLimitError) return rateLimitError;

  // Check auth
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    // Parse and validate request body
    const body = await request.json();
    const parseResult = PublishCancelRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { publishId } = parseResult.data;

    console.log(`[publish:cancel] Cancelling job: ${publishId}`);

    // Get job
    const job = await getPublishJob(publishId);
    if (!job) {
      return NextResponse.json(
        { error: 'Publish job not found' },
        { status: 404 }
      );
    }

    // Can't cancel terminal states
    if (isTerminalStatus(job.status)) {
      return NextResponse.json({
        success: false,
        status: job.status,
        message: `Cannot cancel job in ${job.status} state`,
      });
    }

    // Try to cancel Vercel deployment if there is one
    if (job.vercel_deployment_id) {
      try {
        await cancelDeployment(job.vercel_deployment_id);
        console.log(`[publish:cancel] Cancelled Vercel deployment: ${job.vercel_deployment_id}`);
      } catch (vercelError) {
        console.warn('[publish:cancel] Failed to cancel Vercel deployment:', vercelError);
        // Continue anyway - mark as cancelled in our DB
      }
    }

    // Update job status
    await updateJobStatus(publishId, 'cancelled');

    return NextResponse.json({
      success: true,
      status: 'cancelled',
    });
  } catch (error) {
    console.error('[publish:cancel] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
