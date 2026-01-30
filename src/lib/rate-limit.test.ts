/**
 * Rate Limit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { checkRateLimit, resetRateLimitForTesting, getRateLimitStatus } from './rate-limit';

// Mock NextRequest
function createMockRequest(ip: string = '127.0.0.1'): NextRequest {
  const url = new URL('http://localhost/api/test');
  const headers = new Headers();
  headers.set('x-forwarded-for', ip);

  return {
    headers,
    nextUrl: url,
  } as unknown as NextRequest;
}

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimitForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const request = createMockRequest('192.168.1.1');

    for (let i = 0; i < 60; i++) {
      const result = checkRateLimit(request);
      expect(result).toBeNull();
    }
  });

  it('blocks requests over the limit', () => {
    const request = createMockRequest('192.168.1.2');

    // Make 60 allowed requests
    for (let i = 0; i < 60; i++) {
      checkRateLimit(request);
    }

    // 61st request should be blocked
    const result = checkRateLimit(request);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  it('resets limit after window expires', () => {
    const request = createMockRequest('192.168.1.3');

    // Hit the limit
    for (let i = 0; i < 61; i++) {
      checkRateLimit(request);
    }

    // Advance time past the window (1 minute)
    vi.advanceTimersByTime(61000);

    // Should be allowed again
    const result = checkRateLimit(request);
    expect(result).toBeNull();
  });

  it('tracks IPs independently', () => {
    const request1 = createMockRequest('10.0.0.1');
    const request2 = createMockRequest('10.0.0.2');

    // Exhaust limit for IP 1
    for (let i = 0; i < 61; i++) {
      checkRateLimit(request1);
    }

    // IP 1 should be blocked
    expect(checkRateLimit(request1)).not.toBeNull();

    // IP 2 should still be allowed
    expect(checkRateLimit(request2)).toBeNull();
  });

  it('returns correct remaining count', () => {
    const request = createMockRequest('10.0.0.3');

    let status = getRateLimitStatus(request);
    expect(status.remaining).toBe(60);

    checkRateLimit(request);
    status = getRateLimitStatus(request);
    expect(status.remaining).toBe(59);

    for (let i = 0; i < 59; i++) {
      checkRateLimit(request);
    }

    status = getRateLimitStatus(request);
    expect(status.remaining).toBe(0);
  });
});
