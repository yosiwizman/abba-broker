/**
 * Rate Limiting
 *
 * Simple in-memory rate limiter per IP address.
 * For MVP - consider Redis for production multi-instance deployment.
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute (generous for polling)

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string {
  // Check common proxy headers
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback - this won't work in production behind a proxy
  return 'unknown';
}

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(ip);
    }
  }
}

// Run cleanup every minute
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, RATE_LIMIT_WINDOW_MS);
}

/**
 * Check and update rate limit for a request
 * Returns null if allowed, or an error response if rate limited
 */
export function checkRateLimit(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request);
  const now = Date.now();

  let entry = rateLimitStore.get(ip);

  if (!entry || entry.resetTime < now) {
    // Create new entry or reset expired one
    entry = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
    rateLimitStore.set(ip, entry);
    return null;
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  return null;
}

/**
 * Get current rate limit status for testing/debugging
 */
export function getRateLimitStatus(request: NextRequest): {
  remaining: number;
  resetTime: number;
} {
  const ip = getClientIp(request);
  const entry = rateLimitStore.get(ip);
  const now = Date.now();

  if (!entry || entry.resetTime < now) {
    return {
      remaining: RATE_LIMIT_MAX_REQUESTS,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  return {
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count),
    resetTime: entry.resetTime,
  };
}

/**
 * Reset rate limit for testing
 */
export function resetRateLimitForTesting(): void {
  rateLimitStore.clear();
}
