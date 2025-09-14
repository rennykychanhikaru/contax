/**
 * Date utility functions for Google Calendar integration
 *
 * This module provides utilities for handling RFC3339 datetime formatting
 * and timezone conversions, particularly for Google Calendar API operations.
 */

/**
 * Normalizes a datetime string to RFC3339 format with proper timezone handling.
 *
 * This function takes an input datetime string and ensures it's properly formatted
 * for use with Google Calendar API. It handles timezone conversions by:
 * 1. Stripping any existing timezone information from the input
 * 2. Interpreting the wall-clock time in the specified timezone
 * 3. Adding the appropriate timezone offset
 *
 * @param input - The datetime string to normalize (ISO format expected)
 * @param timeZone - The timezone to apply (IANA timezone identifier, e.g., 'America/New_York')
 * @returns RFC3339 formatted datetime string with timezone offset
 *
 * @example
 * ```typescript
 * normalizeRfc3339('2024-01-15T14:30:00', 'America/New_York')
 * // Returns: '2024-01-15T14:30:00-05:00' (during EST)
 *
 * normalizeRfc3339('2024-01-15T14:30', 'Europe/London')
 * // Returns: '2024-01-15T14:30:00+00:00' (during GMT)
 *
 * normalizeRfc3339('2024-01-15T14:30:00')
 * // Returns: '2024-01-15T14:30:00Z' (UTC when no timezone provided)
 * ```
 */
export function normalizeRfc3339(input: string, timeZone?: string): string {
  if (!input) return input

  // Always interpret the wall-clock portion in the provided timezone (if given),
  // ignoring any incoming offset to avoid ET/UTC mismatches.
  let s = input.trim()
  s = s.replace(/[zZ]$/, '').replace(/[+-]\d{2}:\d{2}$/, '')

  // Add seconds if missing
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00'

  // If no timezone provided, return UTC
  if (!timeZone) return s + 'Z'

  // Parse the datetime components
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return s + 'Z'

  const [, year, month, day, hour, minute, second] = match
  const y = Number(year)
  const mo = Number(month)
  const d = Number(day)
  const h = Number(hour)
  const mi = Number(minute)
  const se = Number(second)

  // Create a UTC date with the wall-clock time
  const utcProbe = new Date(Date.UTC(y, mo - 1, d, h, mi, se))

  // Get the timezone offset for this specific moment
  const offset = tzOffsetString(timeZone, utcProbe)

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`
}

/**
 * Generates a timezone offset string in RFC3339 format for a given timezone and date.
 *
 * This function uses the Intl.DateTimeFormat API to determine the timezone offset
 * for a specific date and timezone, then formats it as an RFC3339 offset string.
 *
 * @param timeZone - The IANA timezone identifier (e.g., 'America/New_York', 'Europe/London')
 * @param utcDate - The UTC date to calculate the offset for
 * @returns Timezone offset string in format '+HH:mm' or '-HH:mm', or 'Z' for UTC/GMT
 *
 * @example
 * ```typescript
 * const date = new Date('2024-01-15T19:30:00.000Z')
 *
 * tzOffsetString('America/New_York', date)
 * // Returns: '-05:00' (EST during winter)
 *
 * tzOffsetString('Europe/London', date)
 * // Returns: '+00:00' (GMT during winter)
 *
 * tzOffsetString('Asia/Tokyo', date)
 * // Returns: '+09:00'
 * ```
 */
export function tzOffsetString(timeZone: string, utcDate: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  const parts = formatter.formatToParts(utcDate)
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0'

  // Parse timezone name like 'GMT-5' or 'GMT+0'
  const match = tzName.match(/GMT([+-])(\d{1,2})/)
  if (!match) return 'Z'

  const sign = match[1] === '-' ? '-' : '+'
  const hours = String(Number(match[2])).padStart(2, '0')

  return `${sign}${hours}:00`
}