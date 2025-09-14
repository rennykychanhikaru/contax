// Google Calendar API Types

// Google OAuth Token Response
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

// Google Calendar Types
export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: 'owner' | 'reader' | 'writer' | 'freeBusyReader';
  selected?: boolean;
  timeZone?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  description?: string;
  location?: string;
}

export interface GoogleCalendarListResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  items: GoogleCalendar[];
}

// Google Calendar Event Types
export interface GoogleCalendarDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleCalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
  resource?: boolean;
}

export interface GoogleConferenceData {
  conferenceSolution?: {
    key: {
      type: string;
    };
  };
  createRequest?: {
    requestId: string;
    conferenceSolutionKey: {
      type: string;
    };
  };
  entryPoints?: Array<{
    entryPointType: string;
    uri: string;
    label?: string;
  }>;
}

export interface GoogleCalendarEvent {
  id?: string;
  status?: string;
  htmlLink?: string;
  created?: string;
  updated?: string;
  summary: string;
  description?: string;
  location?: string;
  start: GoogleCalendarDateTime;
  end: GoogleCalendarDateTime;
  attendees?: GoogleCalendarAttendee[];
  conferenceData?: GoogleConferenceData;
  hangoutLink?: string;
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  creator?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  iCalUID?: string;
  sequence?: number;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  recurrence?: string[];
}

// Google FreeBusy API Types
export interface GoogleFreeBusyRequest {
  timeMin: string;
  timeMax: string;
  timeZone?: string;
  groupExpansionMax?: number;
  calendarExpansionMax?: number;
  items: Array<{ id: string }>;
}

export interface GoogleFreeBusyResponse {
  kind: string;
  timeMin: string;
  timeMax: string;
  calendars: {
    [calendarId: string]: {
      busy: Array<{
        start: string;
        end: string;
      }>;
      errors?: Array<{
        domain: string;
        reason: string;
      }>;
    };
  };
}

// Google Settings API Types
export interface GoogleTimezoneSetting {
  kind: string;
  etag: string;
  value: string;
}

// Google API Error Types
export interface GoogleApiError {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      '@type': string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
    }>;
  };
}

// Calendar Creation Request
export interface CreateCalendarEventRequest {
  summary: string;
  description?: string;
  start: GoogleCalendarDateTime;
  end: GoogleCalendarDateTime;
  attendees?: GoogleCalendarAttendee[];
  location?: string;
  conferenceData?: GoogleConferenceData;
}

// Calendar Availability Check Types
export interface CalendarAvailabilityResult {
  available: boolean;
  conflicts: Array<{ start: string; end: string }>;
  timeZone?: string;
}

// Time slot generation types
export interface TimeSlot {
  start: string;
  end: string;
}

export interface BusinessHours {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

// Google OAuth URLs and scopes
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

export type GoogleCalendarScope = typeof GOOGLE_CALENDAR_SCOPES[number];

// Token refresh types
export interface TokenRefreshRequest {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  grant_type: 'refresh_token';
}

export interface TokenRefreshResponse extends GoogleTokenResponse {
  error?: string;
  error_description?: string;
}