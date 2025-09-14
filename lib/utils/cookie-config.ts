/**
 * Centralized cookie configuration for secure cookie handling
 * Ensures consistent security settings across the application
 */

import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

/**
 * Type definition for cookie options
 */
export interface SecureCookieOptions extends Partial<ResponseCookie> {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  path?: string
  maxAge?: number
  expires?: Date
}

/**
 * Default secure cookie configuration
 * - httpOnly: true (prevents XSS attacks)
 * - secure: true in production (HTTPS only)
 * - sameSite: 'lax' (CSRF protection while maintaining usability)
 * - path: '/' (available site-wide)
 */
const defaultSecureOptions: SecureCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
}

/**
 * Configuration for different types of cookies
 */
export const CookieConfig = {
  /**
   * Google Calendar access tokens
   * Short-lived with 1 hour default expiry
   */
  googleCalendarAccess: {
    ...defaultSecureOptions,
    maxAge: 3600, // 1 hour
  } as SecureCookieOptions,

  /**
   * Google Calendar refresh tokens
   * Long-lived with 30 days expiry
   */
  googleCalendarRefresh: {
    ...defaultSecureOptions,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  } as SecureCookieOptions,

  /**
   * Token expiry timestamps
   * Same lifetime as access tokens
   */
  tokenExpiry: {
    ...defaultSecureOptions,
    maxAge: 3600, // 1 hour
  } as SecureCookieOptions,

  /**
   * General authentication tokens
   * 24 hour default expiry
   */
  authToken: {
    ...defaultSecureOptions,
    maxAge: 24 * 60 * 60, // 24 hours
  } as SecureCookieOptions,

  /**
   * Cookie deletion configuration
   * Used when clearing cookies
   */
  deletion: {
    ...defaultSecureOptions,
    maxAge: 0,
    expires: new Date(0),
  } as SecureCookieOptions,
} as const

/**
 * Helper function to create secure cookie options with custom overrides
 * @param overrides - Custom options to override defaults
 * @returns Complete cookie options with security settings
 */
export function createSecureCookieOptions(overrides: Partial<SecureCookieOptions> = {}): SecureCookieOptions {
  return {
    ...defaultSecureOptions,
    ...overrides,
  }
}

/**
 * Helper function to get cookie configuration by type
 * @param type - The type of cookie configuration to retrieve
 * @param overrides - Additional options to override
 * @returns Cookie options for the specified type
 */
export function getCookieConfig(
  type: keyof typeof CookieConfig,
  overrides: Partial<SecureCookieOptions> = {}
): SecureCookieOptions {
  return {
    ...CookieConfig[type],
    ...overrides,
  }
}

/**
 * Validate cookie options to ensure security requirements are met
 * @param options - Cookie options to validate
 * @returns true if options are secure, false otherwise
 */
export function validateCookieOptions(options: SecureCookieOptions): boolean {
  // In production, cookies must be secure
  if (process.env.NODE_ENV === 'production' && !options.secure) {
    console.warn('Cookie security warning: secure flag should be true in production')
    return false
  }

  // Sensitive cookies should be httpOnly
  if (options.httpOnly === false) {
    console.warn('Cookie security warning: httpOnly should be true for sensitive cookies')
    return false
  }

  // SameSite should be set for CSRF protection
  if (!options.sameSite) {
    console.warn('Cookie security warning: sameSite should be set for CSRF protection')
    return false
  }

  return true
}