/**
 * Authentication Middleware
 *
 * Validates the device token for API requests.
 * Uses constant-time comparison to prevent timing attacks.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Get the server's device token from environment.
 * Returns null if not configured (empty or missing).
 */
function getServerToken(): string | null {
  const token = process.env.ABBA_DEVICE_TOKEN;
  return token && token.trim().length > 0 ? token.trim() : null;
}

/**
 * Check if the server token is configured
 */
export function isServerTokenConfigured(): boolean {
  return getServerToken() !== null;
}

/**
 * Get first 8 chars of SHA256 hash (safe fingerprint for logging)
 */
export function getTokenHashPrefix(token: string): string {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return hash.substring(0, 8);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Result of detailed token validation
 */
export type TokenValidationResult =
  | { valid: true }
  | { valid: false; reason: 'not_configured' | 'missing' | 'invalid' };

/**
 * Validate the device token with detailed error reason.
 * Also logs safe diagnostics (hash prefixes, not actual tokens).
 */
export function validateDeviceTokenDetailed(token: string | null): TokenValidationResult {
  const serverToken = getServerToken();

  // Log safe diagnostics
  const serverConfigured = serverToken !== null;
  const headerPresent = token !== null && token.length > 0;
  const serverHashPrefix = serverToken ? getTokenHashPrefix(serverToken) : 'none';
  const clientHashPrefix = token ? getTokenHashPrefix(token) : 'none';

  console.log(
    `[auth] serverConfigured=${serverConfigured}, headerPresent=${headerPresent}, ` +
      `serverHash=${serverHashPrefix}, clientHash=${clientHashPrefix}`
  );

  if (!serverToken) {
    console.error('[auth] ABBA_DEVICE_TOKEN not configured on server');
    return { valid: false, reason: 'not_configured' };
  }

  if (!token) {
    return { valid: false, reason: 'missing' };
  }

  if (constantTimeCompare(token, serverToken)) {
    return { valid: true };
  }

  console.warn(
    `[auth] Token mismatch: server=${serverHashPrefix}..., client=${clientHashPrefix}...`
  );
  return { valid: false, reason: 'invalid' };
}

/**
 * Validate the device token from the request header
 */
export function validateDeviceToken(token: string | null): boolean {
  const result = validateDeviceTokenDetailed(token);
  return result.valid;
}

/**
 * Extract device token from request headers
 */
export function getDeviceToken(request: NextRequest): string | null {
  return request.headers.get('x-abba-device-token');
}

/**
 * Auth middleware for API routes.
 * Returns null if authenticated, or an error response if not.
 *
 * Error responses:
 * - 503 BrokerMisconfigured: ABBA_DEVICE_TOKEN not set on server
 * - 401 Unauthorized: Missing or invalid device token from client
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const token = getDeviceToken(request);
  const result = validateDeviceTokenDetailed(token);

  if (result.valid) {
    return null;
  }

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

/**
 * Redact sensitive information from error messages
 */
export function redactSensitiveInfo(message: string): string {
  // Redact anything that looks like a token or key
  return message
    .replace(/[A-Za-z0-9_-]{32,}/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/token["']?:\s*["'][^"']+["']/gi, 'token: "[REDACTED]"');
}
