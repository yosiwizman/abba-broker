/**
 * Publish Complete Endpoint
 *
 * POST /api/v1/publish/complete
 * Triggers deployment after upload (optional, for multi-step flows)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getPublishJob, updateJobStatus } from '@/lib/db';
import { PublishCompleteRequestSchema } from '@/lib/types';

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
    const parseResult = PublishCompleteRequestSchema.safeParse(body);

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

    console.log(`[publish:complete] Completing job: ${publishId}`);

    // Get job
    const job = await getPublishJob(publishId);
    if (!job) {
      return NextResponse.json(
        { error: 'Publish job not found' },
        { status: 404 }
      );
    }

    // For our flow, the upload endpoint already triggers deployment
    // This endpoint is mainly for compatibility with multi-step upload flows

    // If job is still in early stages, it means upload hasn't happened
    if (job.status === 'queued') {
      return NextResponse.json(
        { error: 'Bundle not uploaded yet' },
        { status: 400 }
      );
    }

    // If job is already deploying/building, just confirm
    if (['uploading', 'packaging', 'building', 'deploying'].includes(job.status)) {
      return NextResponse.json({
        success: true,
        message: 'Deployment in progress',
        status: job.status,
      });
    }

    // If job is in a terminal state, return that
    return NextResponse.json({
      success: job.status === 'ready',
      status: job.status,
      url: job.url,
      error: job.error,
    });
  } catch (error) {
    console.error('[publish:complete] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
