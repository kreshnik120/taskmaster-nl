const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute per IP

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const requestCounts = new Map<string, RateLimitRecord>();

/**
 * IP-based rate limiter to prevent brute-force attacks
 * Uses in-memory cache (resets on function restart)
 * @param clientIp - IP address of the client
 * @returns true if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(clientIp);

  // Clean up old records periodically (prevent memory leak)
  if (requestCounts.size > 10000) {
    const cutoff = now - RATE_LIMIT_WINDOW;
    for (const [ip, rec] of requestCounts.entries()) {
      if (rec.resetAt < cutoff) {
        requestCounts.delete(ip);
      }
    }
  }

  // Reset if window expired
  if (!record || now > record.resetAt) {
    requestCounts.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  // Check if limit exceeded
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    console.warn(`⚠️ Rate limit exceeded for IP: ${clientIp} (${record.count} requests)`);
    return false;
  }

  // Increment count
  record.count++;
  return true;
}

/**
 * Get current rate limit status for an IP
 */
export function getRateLimitStatus(clientIp: string): { 
  remaining: number; 
  resetAt: number;
  limit: number;
} {
  const now = Date.now();
  const record = requestCounts.get(clientIp);

  if (!record || now > record.resetAt) {
    return { 
      remaining: MAX_REQUESTS_PER_WINDOW, 
      resetAt: now + RATE_LIMIT_WINDOW,
      limit: MAX_REQUESTS_PER_WINDOW 
    };
  }

  return { 
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - record.count),
    resetAt: record.resetAt,
    limit: MAX_REQUESTS_PER_WINDOW
  };
}
