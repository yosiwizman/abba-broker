/**
 * Publish Start Endpoint
 *
 * POST /api/v1/publish/start
 * Starts a new publish operation and returns publishId + uploadUrl
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { createPublishJob } from '@/lib/db';
import { PublishStartRequestSchema } from '@/lib/types';

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
    const parseResult = PublishStartRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { appId, bundleHash, bundleSize, profileId, appName } = parseResult.data;

    console.log(`[publish:start] Creating job for app ${appId}, bundle size: ${bundleSize}`);

    // Create publish job
    const job = await createPublishJob({
      appId,
      appName,
      profileId,
      bundleHash,
      bundleSize,
    });

    console.log(`[publish:start] Created job: ${job.id}`);

    // Build upload URL (relative to this broker)
    const uploadUrl = `/api/v1/publish/upload?publishId=${encodeURIComponent(job.id)}`;

    return NextResponse.json({
      publishId: job.id,
      status: job.status,
      uploadUrl,
    });
  } catch (error) {
    console.error('[publish:start] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
