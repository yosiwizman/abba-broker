/**
 * Authentication Middleware
 *
 * Validates the device token for API requests.
 * Uses constant-time comparison to prevent timing attacks.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const DEVICE_TOKEN = process.env.ABBA_DEVICE_TOKEN;

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
 * Validate the device token with detailed error reason
 */
export function validateDeviceTokenDetailed(token: string | null): TokenValidationResult {
  if (!DEVICE_TOKEN) {
    console.error('[auth] ABBA_DEVICE_TOKEN not configured');
    return { valid: false, reason: 'not_configured' };
  }

  if (!token) {
    return { valid: false, reason: 'missing' };
  }

  if (constantTimeCompare(token, DEVICE_TOKEN)) {
    return { valid: true };
  }

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
 * Auth middleware for API routes
 * Returns null if authenticated, or an error response if not
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const token = getDeviceToken(request);

  if (!validateDeviceToken(token)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or missing device token' },
      { status: 401 }
    );
  }

  return null;
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
