import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  refreshGoogleAccessToken,
  getAccountTimezone,
  listCalendars,
  checkCalendarAvailability as googleCheckAvailability,
  createCalendarEvent
} from './google';
import {
  getAgentCalendarTokens,
  validateAgentAccess,
  AgentCalendarIntegration
} from './agent-calendar';

// Types for the service
export interface CalendarToken {
  access_token: string;
  refresh_token?: string;
  expiry?: number;
}

export interface CalendarServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  cookies?: Array<{ name: string; value: string }>;
}

export interface AvailabilityRequest {
  start: string;
  end: string;
  calendarId?: string;
  calendarIds?: string[];
  organizationId?: string;
}

export interface SlotsRequest {
  date: string;
  slotMinutes?: number;
  businessHours?: { start?: string; end?: string };
  calendarIds?: string[];
  organizationId?: string;
}

export interface CalendarStatus {
  connected: boolean;
  hasToken: boolean;
  scopes?: string[];
  calendars?: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    accessRole?: string;
    selected?: boolean;
  }>;
  primaryReachable?: boolean;
  primaryTimeZone?: string;
  accountTimeZone?: string;
  errors?: Array<{ step: string; message: string }>;
  email?: string;
  calendarId?: string;
  lastSync?: string;
  connectedAt?: string;
}

export interface BookingRequest {
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: Array<{ email: string }>;
  location?: string;
  createMeetLink?: boolean;
  calendarId?: string;
  timeZone?: string;
}

/**
 * Unified Calendar Service for handling both user and agent calendar operations
 */
export class CalendarService {

  /**
   * Get calendar tokens from cookies with automatic refresh
   */
  static async getUserTokens(): Promise<CalendarServiceResult<CalendarToken>> {
    const c = await cookies();
    let accessToken = c.get('gcal_access')?.value ||
                     c.get('gcal_token')?.value ||
                     process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;

    const refreshToken = c.get('gcal_refresh')?.value;
    const expiry = Number(c.get('gcal_expiry')?.value || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const setCookies: Array<{ name: string; value: string }> = [];

    // Check if token needs refresh
    if ((!accessToken || (expiry && nowSec >= expiry)) &&
        refreshToken &&
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET) {

      const refreshResult = await refreshGoogleAccessToken(
        refreshToken,
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!
      );

      if (refreshResult?.access_token) {
        accessToken = refreshResult.access_token;
        const newExpiry = nowSec + (refreshResult.expires_in || 3600) - 60;
        setCookies.push(
          { name: 'gcal_access', value: accessToken },
          { name: 'gcal_expiry', value: String(newExpiry) },
          { name: 'gcal_token', value: accessToken }
        );
      }
    }

    if (!accessToken) {
      return { success: false, error: 'No valid access token available' };
    }

    return {
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry
      },
      cookies: setCookies
    };
  }

  /**
   * Get agent tokens with validation and automatic refresh
   */
  static async getAgentTokens(agentId: string, userId?: string): Promise<CalendarServiceResult<AgentCalendarIntegration>> {
    try {
      // Validate agent access if userId provided
      if (userId) {
        const agentAccess = await validateAgentAccess(agentId, userId);
        if (!agentAccess) {
          return { success: false, error: 'Agent not found or access denied' };
        }
      }

      const tokens = await getAgentCalendarTokens(agentId);
      if (!tokens || !tokens.access_token) {
        return { success: false, error: 'Agent calendar not connected' };
      }

      return { success: true, data: tokens };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agent tokens'
      };
    }
  }

  /**
   * Check calendar availability with unified logic
   */
  static async checkAvailability(
    request: AvailabilityRequest,
    agentId?: string,
    userId?: string
  ): Promise<CalendarServiceResult> {
    try {
      const { start, end, calendarId = 'primary', calendarIds } = request;

      if (!start || !end) {
        return { success: false, error: 'Start and end times are required' };
      }

      // Get appropriate tokens
      let tokenResult: CalendarServiceResult<CalendarToken | AgentCalendarIntegration>;
      if (agentId) {
        tokenResult = await this.getAgentTokens(agentId, userId);
      } else {
        tokenResult = await this.getUserTokens();
      }

      if (!tokenResult.success || !tokenResult.data) {
        return tokenResult;
      }

      const accessToken = tokenResult.data.access_token;

      // Get account timezone
      const accountTz = await getAccountTimezone(accessToken);
      const baseTz = accountTz || undefined;

      // Normalize datetimes
      const normStart = this.normalizeRfc3339(start, baseTz);
      const normEnd = this.normalizeRfc3339(end, baseTz);

      // Guardrail: reject overly broad windows
      const ms = Date.parse(normEnd) - Date.parse(normStart);
      const fourHours = 4 * 60 * 60 * 1000;
      if (ms > fourHours) {
        return {
          success: false,
          error: 'Window too large for availability check; use getAvailableSlots instead',
          data: {
            error: 'broad_window',
            message: 'Window too large for slot check; use getAvailableSlots instead',
            start: normStart,
            end: normEnd,
            timeZone: baseTz || null
          }
        };
      }

      // Use existing checkCalendarAvailability function
      const availability = await googleCheckAvailability(
        accessToken,
        normStart,
        normEnd,
        calendarId,
        calendarIds
      );

      // Determine which calendars were used
      let usedGoogleCalendars: string[] = [];
      if (calendarIds && calendarIds.length > 0) {
        usedGoogleCalendars = calendarIds;
      } else {
        const calendars = await listCalendars(accessToken);
        if (calendars && calendars.length > 0) {
          usedGoogleCalendars = calendars
            .filter(c => (c.selected === true || c.primary === true) &&
                        (c.accessRole === 'owner' || c.accessRole === 'writer'))
            .map(c => c.id);
        }
        if (usedGoogleCalendars.length === 0) {
          usedGoogleCalendars = [calendarId];
        }
      }

      const result = {
        available: availability.available,
        conflicts: { google: availability.conflicts },
        usedGoogle: true,
        googleError: null,
        usedGoogleCalendars,
        start: normStart,
        end: normEnd,
        timeZone: baseTz || null
      };

      return {
        success: true,
        data: result,
        cookies: tokenResult.cookies
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check availability'
      };
    }
  }

  /**
   * Get available slots with unified logic
   */
  static async getAvailableSlots(
    request: SlotsRequest,
    agentId?: string,
    userId?: string
  ): Promise<CalendarServiceResult> {
    try {
      const { date, calendarIds } = request;
      const slotMinutes = Math.max(5, Math.min(240, request.slotMinutes || 60));
      const bhStart = request.businessHours?.start || '09:00';
      const bhEnd = request.businessHours?.end || '17:00';

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return {
          success: false,
          error: 'Invalid date format. Expected YYYY-MM-DD'
        };
      }

      // Get appropriate tokens
      let tokenResult: CalendarServiceResult<CalendarToken | AgentCalendarIntegration>;
      if (agentId) {
        tokenResult = await this.getAgentTokens(agentId, userId);
      } else {
        tokenResult = await this.getUserTokens();
      }

      if (!tokenResult.success || !tokenResult.data) {
        return tokenResult;
      }

      const accessToken = tokenResult.data.access_token;
      const accountTz = (await getAccountTimezone(accessToken)) || 'UTC';

      // Determine day window in timezone
      const [y, m, d] = date.split('-').map(Number);
      const dayStartIso = this.withTzIso(y, m, d, 0, 0, 0, accountTz);
      const dayEndIso = this.withTzIso(y, m, d, 23, 59, 59, accountTz);
      const bhStartIso = this.withTzIso(y, m, d, ...this.parseTime(bhStart), accountTz);
      const bhEndIso = this.withTzIso(y, m, d, ...this.parseTime(bhEnd), accountTz);

      // Determine calendars to consider
      let ids = calendarIds && calendarIds.length ? calendarIds : [];
      if (!ids.length) {
        const calendars = await listCalendars(accessToken);
        if (calendars && calendars.length > 0) {
          ids = calendars
            .filter(c => c.selected === true || c.primary === true)
            .map(c => c.id);
        }
      }
      if (!ids.length) {
        return { success: false, error: 'No calendars available' };
      }

      // Get busy periods using FreeBusy API
      const fbResp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeMin: dayStartIso,
          timeMax: dayEndIso,
          timeZone: accountTz,
          items: ids.map(id => ({ id }))
        })
      });

      if (!fbResp.ok) {
        return {
          success: false,
          error: `Google Calendar API error: ${await fbResp.text()}`
        };
      }

      const fb = await fbResp.json();
      const busy: Array<{ start: number; end: number }> = [];

      for (const id of ids) {
        const arr = fb?.calendars?.[id]?.busy || [];
        for (const b of arr) {
          busy.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
        }
      }

      // Merge overlapping busy intervals
      busy.sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const b of busy) {
        if (!merged.length || b.start > merged[merged.length - 1].end) {
          merged.push({ ...b });
        } else {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, b.end);
        }
      }

      // Compute free windows within business hours
      const bhStartTs = Date.parse(bhStartIso);
      const bhEndTs = Date.parse(bhEndIso);
      const free: Array<{ start: number; end: number }> = [];
      let cursor = bhStartTs;

      for (const b of merged) {
        if (b.end <= bhStartTs || b.start >= bhEndTs) continue;
        if (b.start > cursor) {
          free.push({ start: cursor, end: Math.min(b.start, bhEndTs) });
        }
        cursor = Math.max(cursor, b.end);
        if (cursor >= bhEndTs) break;
      }
      if (cursor < bhEndTs) {
        free.push({ start: cursor, end: bhEndTs });
      }

      // Generate slots from free windows
      const slots: Array<{ start: string; end: string }> = [];
      for (const w of free) {
        let s = w.start;
        while (s + slotMinutes * 60000 <= w.end) {
          const e = s + slotMinutes * 60000;
          slots.push({
            start: new Date(s).toISOString(),
            end: new Date(e).toISOString()
          });
          s += slotMinutes * 60000;
        }
      }

      const result = {
        slots,
        timeZone: accountTz,
        usedGoogleCalendars: ids,
        dayStart: dayStartIso,
        dayEnd: dayEndIso,
        businessHours: { start: bhStart, end: bhEnd },
        slotMinutes
      };

      return {
        success: true,
        data: result,
        cookies: tokenResult.cookies
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get available slots'
      };
    }
  }

  /**
   * Get calendar status with unified logic
   */
  static async getCalendarStatus(
    agentId?: string,
    userId?: string
  ): Promise<CalendarServiceResult<CalendarStatus>> {
    try {
      // Get appropriate tokens
      let tokenResult: CalendarServiceResult<CalendarToken | AgentCalendarIntegration>;
      if (agentId) {
        tokenResult = await this.getAgentTokens(agentId, userId);

        if (!tokenResult.success) {
          // For agents, check if it's just not connected
          const agentAccess = userId ? await validateAgentAccess(agentId, userId) : null;
          if (agentAccess) {
            return {
              success: true,
              data: {
                connected: false,
                hasToken: false,
                calendars: [],
                email: null,
                calendarId: null,
                errors: [{ step: 'authentication', message: tokenResult.error || 'Not connected' }]
              }
            };
          }
          return tokenResult;
        }
      } else {
        tokenResult = await this.getUserTokens();
        if (!tokenResult.success) {
          return {
            success: true,
            data: {
              connected: false,
              hasToken: false,
              errors: [{ step: 'authentication', message: tokenResult.error || 'No token' }]
            }
          };
        }
      }

      const accessToken = tokenResult.data!.access_token;
      const status: CalendarStatus = {
        connected: false,
        hasToken: !!accessToken,
        errors: []
      };

      if (!accessToken) {
        return { success: true, data: status, cookies: tokenResult.cookies };
      }

      // Check token scopes
      try {
        const info = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
        if (info.ok) {
          const j = await info.json();
          const scopes = typeof j.scope === 'string' ? j.scope.split(' ') : [];
          status.scopes = scopes;
        } else {
          status.errors!.push({
            step: 'tokeninfo',
            message: `${info.status} ${await info.text()}`
          });
        }
      } catch (e) {
        status.errors!.push({
          step: 'tokeninfo',
          message: e?.message || 'tokeninfo failed'
        });
      }

      // List calendars
      try {
        const calendars = await listCalendars(accessToken);
        if (calendars) {
          status.calendars = calendars;
          const primary = calendars.find(c => c.primary) || calendars.find(c => c.selected);
          if (primary?.timeZone) {
            status.primaryTimeZone = primary.timeZone;
          }
        }
      } catch (e) {
        status.errors!.push({
          step: 'calendarList',
          message: e?.message || 'calendarList failed'
        });
      }

      // Test primary calendar access with FreeBusy probe
      try {
        const now = new Date();
        const end = new Date(now.getTime() + 60 * 60 * 1000);
        const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            timeMin: now.toISOString(),
            timeMax: end.toISOString(),
            items: [{ id: 'primary' }]
          })
        });

        status.primaryReachable = fb.ok;
        if (!fb.ok) {
          status.errors!.push({
            step: 'freeBusy',
            message: `${fb.status} ${await fb.text()}`
          });
        }
      } catch (e) {
        status.primaryReachable = false;
        status.errors!.push({
          step: 'freeBusy',
          message: e?.message || 'freeBusy failed'
        });
      }

      // Get account timezone
      try {
        const tz = await getAccountTimezone(accessToken);
        if (tz) status.accountTimeZone = tz;
      } catch {
    // Error handled
  }

      // For agent calendars, add additional info
      if (agentId) {
        const agentData = tokenResult.data as AgentCalendarIntegration;
        status.email = agentData.calendar_email;
        status.calendarId = agentData.calendar_id;
      }

      status.connected = !!status.scopes &&
                        Array.isArray(status.calendars) &&
                        status.primaryReachable === true;

      return {
        success: true,
        data: status,
        cookies: tokenResult.cookies
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get calendar status'
      };
    }
  }

  /**
   * List calendars with unified logic
   */
  static async listCalendars(
    agentId?: string,
    userId?: string
  ): Promise<CalendarServiceResult> {
    try {
      // Get appropriate tokens
      let tokenResult: CalendarServiceResult<CalendarToken | AgentCalendarIntegration>;
      if (agentId) {
        tokenResult = await this.getAgentTokens(agentId, userId);
      } else {
        tokenResult = await this.getUserTokens();
      }

      if (!tokenResult.success || !tokenResult.data) {
        return tokenResult;
      }

      const accessToken = tokenResult.data.access_token;

      // Use existing listCalendars function
      const calendars = await listCalendars(accessToken);

      if (calendars === null) {
        return {
          success: false,
          error: 'Failed to fetch calendars from Google'
        };
      }

      return {
        success: true,
        data: { calendars },
        cookies: tokenResult.cookies
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list calendars'
      };
    }
  }

  /**
   * Book a calendar appointment
   */
  static async bookAppointment(
    request: BookingRequest,
    agentId?: string,
    userId?: string
  ): Promise<CalendarServiceResult> {
    try {
      const { summary, description, start, end, attendees, location, createMeetLink, calendarId = 'primary', timeZone } = request;

      if (!summary || !start || !end) {
        return {
          success: false,
          error: 'Summary, start, and end times are required'
        };
      }

      // Get appropriate tokens
      let tokenResult: CalendarServiceResult<CalendarToken | AgentCalendarIntegration>;
      if (agentId) {
        tokenResult = await this.getAgentTokens(agentId, userId);
      } else {
        tokenResult = await this.getUserTokens();
      }

      if (!tokenResult.success || !tokenResult.data) {
        return tokenResult;
      }

      const accessToken = tokenResult.data.access_token;

      // Get account timezone if not provided
      let tz = timeZone;
      if (!tz) {
        tz = await getAccountTimezone(accessToken) || 'UTC';
      }

      // Create event object
      const event = {
        summary,
        description,
        start: { dateTime: start, timeZone: tz },
        end: { dateTime: end, timeZone: tz },
        attendees,
        location,
        conferenceData: createMeetLink ? {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        } : undefined
      };

      // Use the calendar ID from agent data if available
      let targetCalendarId = calendarId;
      if (agentId) {
        const agentData = tokenResult.data as AgentCalendarIntegration;
        if (agentData.calendar_id) {
          targetCalendarId = agentData.calendar_id;
        }
      }

      const result = await createCalendarEvent(accessToken, event, targetCalendarId);

      if (result?.error) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        data: result,
        cookies: tokenResult.cookies
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to book appointment'
      };
    }
  }

  /**
   * Create a standardized NextResponse with cookies
   */
  static createResponse<T>(
    result: CalendarServiceResult<T>,
    statusCode?: number
  ): NextResponse {
    const status = result.success ? (statusCode || 200) : (statusCode || 500);
    const responseData = result.success ? result.data : { error: result.error };

    const response = NextResponse.json(responseData, { status });

    // Set cookies if provided
    if (result.cookies) {
      result.cookies.forEach(cookie => {
        response.cookies.set(cookie.name, cookie.value, {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          path: '/'
        });
      });
    }

    return response;
  }

  // Helper methods

  /**
   * Normalize RFC3339 datetime with timezone
   */
  private static normalizeRfc3339(input: string, timeZone?: string): string {
    if (!input) return input;

    let s = input.trim();
    s = s.replace(/[zZ]$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
    if (!timeZone) return s + 'Z';

    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return s + 'Z';

    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const h = Number(m[4]), mi = Number(m[5]), se = Number(m[6]);
    const utcProbe = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
    const offset = this.tzOffsetString(timeZone, utcProbe);

    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`;
  }

  /**
   * Get timezone offset string
   */
  private static tzOffsetString(timeZone: string, utcDate: Date): string {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const parts = fmt.formatToParts(utcDate);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0';
    const m = tzName.match(/GMT([+-])(\d{1,2})/);
    if (!m) return 'Z';
    const sign = m[1] === '-' ? '-' : '+';
    const hh = String(Number(m[2])).padStart(2, '0');
    return `${sign}${hh}:00`;
  }

  /**
   * Parse time string to hour/minute/second
   */
  private static parseTime(s: string): [number, number, number] {
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return [0, 0, 0];
    return [Number(m[1]), Number(m[2]), 0];
  }

  /**
   * Create ISO string with timezone
   */
  private static withTzIso(y: number, m: number, d: number, hh: number, mm: number, ss: number, timeZone: string): string {
    const utc = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const parts = fmt.formatToParts(utc);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0';
    const m2 = tzName.match(/GMT([+-])(\d{1,2})/);
    const sign = m2?.[1] === '-' ? '-' : '+';
    const off = String(Number(m2?.[2] || '0')).padStart(2, '0');

    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${sign}${off}:00`;
  }
}