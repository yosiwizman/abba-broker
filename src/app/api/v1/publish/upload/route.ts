/**
 * Publish Upload Endpoint
 *
 * PUT /api/v1/publish/upload?publishId=...
 * Accepts multipart/form-data with bundle file
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getPublishJob, updateJobStatus } from '@/lib/db';
import { validateBundleSize, extractBundle, ensureDefaultFiles, computeHash } from '@/lib/bundle';
import { isVercelConfigured, deployBundle, pollDeploymentUntilReady } from '@/lib/vercel';

export const dynamic = 'force-dynamic';

// Increase body size limit
export const maxDuration = 60; // 60 second timeout for uploads

export async function PUT(request: NextRequest) {
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
      return NextResponse.json(
        { error: 'Missing publishId query parameter' },
        { status: 400 }
      );
    }

    console.log(`[publish:upload] Starting upload for job: ${publishId}`);

    // Get job
    const job = await getPublishJob(publishId);
    if (!job) {
      return NextResponse.json(
        { error: 'Publish job not found' },
        { status: 404 }
      );
    }

    // Check job status
    if (job.status !== 'queued') {
      return NextResponse.json(
        { error: `Cannot upload to job in status: ${job.status}` },
        { status: 400 }
      );
    }

    // Update status to uploading
    await updateJobStatus(publishId, 'uploading');

    // Read the bundle data
    const contentType = request.headers.get('content-type') || '';
    let bundleBuffer: Buffer;

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart upload
      const formData = await request.formData();
      const file = formData.get('bundle') as File | null;

      if (!file) {
        await updateJobStatus(publishId, 'failed', { error: 'No bundle file in form data' });
        return NextResponse.json(
          { error: 'No bundle file provided' },
          { status: 400 }
        );
      }

      bundleBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      // Handle raw binary upload
      bundleBuffer = Buffer.from(await request.arrayBuffer());
    }

    console.log(`[publish:upload] Received bundle: ${bundleBuffer.length} bytes`);

    // Validate size
    const sizeValidation = validateBundleSize(bundleBuffer.length);
    if (!sizeValidation.valid) {
      await updateJobStatus(publishId, 'failed', { error: sizeValidation.error });
      return NextResponse.json(
        { error: sizeValidation.error },
        { status: 400 }
      );
    }

    // Verify hash if provided
    const actualHash = computeHash(bundleBuffer);
    if (job.bundle_hash && actualHash !== job.bundle_hash) {
      console.warn(`[publish:upload] Hash mismatch: expected ${job.bundle_hash}, got ${actualHash}`);
      // Don't fail, just log - hash verification is optional
    }

    // Update to packaging
    await updateJobStatus(publishId, 'packaging');

    // Extract bundle
    console.log(`[publish:upload] Extracting bundle...`);
    const { files } = await extractBundle(bundleBuffer);
    const deployFiles = ensureDefaultFiles(files);

    console.log(`[publish:upload] Extracted ${deployFiles.length} files`);

    // Check if Vercel is configured
    if (!isVercelConfigured()) {
      // Mock deployment for testing without Vercel
      console.log(`[publish:upload] Vercel not configured, simulating deployment`);
      await updateJobStatus(publishId, 'ready', {
        url: `https://mock-${job.app_id}.vercel.app`,
      });
      return NextResponse.json({
        success: true,
        message: 'Bundle uploaded (mock deployment)',
      });
    }

    // Deploy to Vercel
    console.log(`[publish:upload] Deploying to Vercel...`);
    const { deploymentId, projectId } = await deployBundle(
      publishId,
      job.app_id,
      actualHash,
      deployFiles
    );

    // Update job with deployment ID
    await updateJobStatus(publishId, 'building', {
      vercel_deployment_id: deploymentId,
      vercel_project_id: projectId,
    });

    // Start polling in the background (don't await)
    // The status endpoint will handle returning the final result
    pollDeploymentUntilReady(publishId, deploymentId).catch((error) => {
      console.error(`[publish:upload] Background poll failed:`, error);
    });

    return NextResponse.json({
      success: true,
      message: 'Bundle uploaded, deployment started',
      deploymentId,
    });
  } catch (error) {
    console.error('[publish:upload] Error:', error);
    return NextResponse.json(
      {
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
