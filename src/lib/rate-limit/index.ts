/**
 * Simple in-memory rate limiter based on sliding window.
 * Limits pipeline runs per IP to prevent abuse of free tier.
 */

interface RateEntry {
  timestamps: number[]
}

const store = new Map<string, RateEntry>()

const DEFAULT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const DEFAULT_MAX_REQUESTS = 5

export function checkRateLimit(
  key: string,
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowMs = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key) || { timestamps: [] }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0]
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestInWindow + windowMs,
    }
  }

  entry.timestamps.push(now)
  store.set(key, entry)

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetAt: now + windowMs,
  }
}

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < DEFAULT_WINDOW_MS)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}, 10 * 60 * 1000)
