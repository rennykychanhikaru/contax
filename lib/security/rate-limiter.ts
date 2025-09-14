/**
 * Simple in-memory rate limiter for Next.js API routes
 * Tracks requests by IP address with configurable limits and time windows
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number
  /** Time window in seconds */
  windowSeconds: number
  /** Optional custom identifier function (default: uses IP address) */
  getIdentifier?: (request: Request) => string | null
}

interface RateLimitResult {
  /** Whether the request should be allowed */
  allowed: boolean
  /** Number of remaining requests in the current window */
  remaining: number
  /** Unix timestamp when the rate limit window resets */
  resetTime: number
  /** Total number of requests allowed per window */
  limit: number
  /** Error message if rate limit exceeded */
  error?: string
}

/**
 * In-memory storage for rate limit tracking
 * In production, consider using Redis or similar for multi-instance deployments
 */
const rateLimitMap = new Map<string, RateLimitEntry>()

/**
 * Clean up expired entries periodically
 */
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 300000 // 5 minutes

function cleanupExpiredEntries() {
  const now = Date.now()

  // Only cleanup every 5 minutes to avoid performance impact
  if (now - lastCleanup < CLEANUP_INTERVAL) {
    return
  }

  const currentTime = Math.floor(now / 1000)

  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetTime < currentTime) {
      rateLimitMap.delete(key)
    }
  }

  lastCleanup = now
}

/**
 * Extract client identifier from request
 * Falls back to various headers if x-forwarded-for is not available
 */
function getClientIdentifier(request: Request): string {
  // Check for forwarded IP (common in proxied environments)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take the first IP in case of comma-separated list
    return forwardedFor.split(',')[0].trim()
  }

  // Check for real IP header (used by some proxies)
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // Check for Cloudflare connecting IP
  const cfIP = request.headers.get('cf-connecting-ip')
  if (cfIP) {
    return cfIP
  }

  // Fallback to user agent + limited headers fingerprint
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const acceptLang = request.headers.get('accept-language') || 'unknown'

  return `fallback:${Buffer.from(userAgent + acceptLang).toString('base64').slice(0, 16)}`
}

/**
 * Check if a request should be rate limited
 *
 * @param request - The incoming request object
 * @param config - Rate limit configuration
 * @returns RateLimitResult indicating if request is allowed
 */
export function checkRateLimit(request: Request, config: RateLimitConfig): RateLimitResult {
  cleanupExpiredEntries()

  const currentTime = Math.floor(Date.now() / 1000)
  const resetTime = currentTime + config.windowSeconds

  // Get client identifier
  const identifier = config.getIdentifier
    ? config.getIdentifier(request)
    : getClientIdentifier(request)

  if (!identifier) {
    // If we can't identify the client, allow the request but log a warning
    console.warn('Rate limiter: Unable to identify client, allowing request')
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
      limit: config.maxRequests
    }
  }

  const key = `ratelimit:${identifier}`
  const existing = rateLimitMap.get(key)

  // If no existing entry or window has expired, create new entry
  if (!existing || existing.resetTime < currentTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime
    })

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
      limit: config.maxRequests
    }
  }

  // Check if limit exceeded
  if (existing.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: existing.resetTime,
      limit: config.maxRequests,
      error: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowSeconds} seconds.`
    }
  }

  // Increment count and allow request
  existing.count++
  rateLimitMap.set(key, existing)

  return {
    allowed: true,
    remaining: config.maxRequests - existing.count,
    resetTime: existing.resetTime,
    limit: config.maxRequests
  }
}

/**
 * Predefined rate limit configurations for common use cases
 */
export const RateLimitPresets = {
  /** Very strict limits for sensitive endpoints */
  strict: {
    maxRequests: 5,
    windowSeconds: 60, // 5 requests per minute
  },

  /** Standard limits for API endpoints */
  standard: {
    maxRequests: 30,
    windowSeconds: 60, // 30 requests per minute
  },

  /** Generous limits for public endpoints */
  generous: {
    maxRequests: 100,
    windowSeconds: 60, // 100 requests per minute
  },

  /** Webhook specific limits (fewer requests, longer window) */
  webhook: {
    maxRequests: 10,
    windowSeconds: 300, // 10 requests per 5 minutes
  },

  /** OAuth callback limits */
  oauth: {
    maxRequests: 5,
    windowSeconds: 300, // 5 requests per 5 minutes
  }
} as const

/**
 * Helper function to apply rate limiting to a Next.js API route
 *
 * @param request - The Next.js request object
 * @param config - Rate limit configuration
 * @returns Response object if rate limited, null if request should proceed
 */
export function rateLimitMiddleware(
  request: Request,
  config: RateLimitConfig
): Response | null {
  const result = checkRateLimit(request, config)

  if (!result.allowed) {
    return new Response(JSON.stringify({
      error: 'Rate Limit Exceeded',
      message: result.error,
      retryAfter: result.resetTime - Math.floor(Date.now() / 1000)
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toString(),
        'Retry-After': (result.resetTime - Math.floor(Date.now() / 1000)).toString()
      }
    })
  }

  // Add rate limit headers to successful responses
  return null // Allow request to proceed
}

/**
 * Add rate limit headers to a response
 *
 * @param response - The response to add headers to
 * @param result - Rate limit result
 */
export function addRateLimitHeaders(response: Response, result: RateLimitResult): Response {
  const headers = new Headers(response.headers)
  headers.set('X-RateLimit-Limit', result.limit.toString())
  headers.set('X-RateLimit-Remaining', result.remaining.toString())
  headers.set('X-RateLimit-Reset', result.resetTime.toString())

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

/**
 * Clear rate limit data for a specific identifier
 * Useful for testing or manual overrides
 */
export function clearRateLimit(identifier: string): boolean {
  const key = `ratelimit:${identifier}`
  return rateLimitMap.delete(key)
}

/**
 * Get current rate limit status for an identifier
 * Useful for debugging or monitoring
 */
export function getRateLimitStatus(identifier: string): RateLimitEntry | null {
  const key = `ratelimit:${identifier}`
  return rateLimitMap.get(key) || null
}