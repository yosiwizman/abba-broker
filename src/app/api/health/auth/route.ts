/**
 * Authenticated Health Check Endpoint
 *
 * GET /api/health/auth
 * Validates the device token and returns auth status.
 *
 * Requires: x-abba-device-token header
 *
 * Responses:
 * - 200: { ok: true, auth: "ok", time: ISO8601 }
 * - 401: { error: "Unauthorized", message: "Missing device token" }
 * - 401: { error: "Unauthorized", message: "Invalid device token" }
 * - 503: { error: "BrokerMisconfigured", message: "ABBA_DEVICE_TOKEN not configured..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDeviceToken, validateDeviceTokenDetailed } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = getDeviceToken(request);
  const result = validateDeviceTokenDetailed(token);

  if (!result.valid) {
    // Server misconfigured - return 503
    if (result.reason === 'not_configured') {
      return NextResponse.json(
        {
          error: 'BrokerMisconfigured',
          message: 'ABBA_DEVICE_TOKEN not configured on server. Set it in Vercel env and redeploy.',
        },
        { status: 503 }
      );
    }

    // Client error - return 401
    const message = result.reason === 'missing' ? 'Missing device token' : 'Invalid device token';
    return NextResponse.json({ error: 'Unauthorized', message }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    auth: 'ok',
    time: new Date().toISOString(),
  });
}
