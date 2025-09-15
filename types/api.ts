// API Request/Response Types for Contax

// Common API response wrapper
export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Google Calendar Types
export interface TimeSlot {
  start: string;
  end: string;
}

export interface GoogleCalendar {
  kind?: string;
  etag?: string;
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  accessRole: string;
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface CalendarEvent {
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  conferenceData?: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: {
        type: string;
      };
    };
  };
}

// Calendar API Types
export interface CheckAvailabilityRequest {
  organizationId?: string;
  start: string;
  end: string;
  calendarId?: string;
  calendarIds?: string[];
}

export interface CheckAvailabilityResponse {
  available: boolean;
  conflicts?: TimeSlot[];
  timeZone?: string;
  start?: string;
  end?: string;
  error?: string;
  usedGoogleCalendars?: string[];
}

export interface GetSlotsRequest {
  organizationId?: string;
  date: string;
  slotMinutes?: number;
  businessHours?: {
    start: string;
    end: string;
  };
  calendarIds?: string[];
}

export interface GetSlotsResponse {
  slots: TimeSlot[];
  timeZone?: string;
  error?: string;
}

export interface CalendarStatusResponse {
  connected: boolean;
  hasToken: boolean;
  scopes?: string[];
  calendars?: Array<{
    id: string;
    summary: string;
    primary?: boolean;
  }>;
  primaryReachable?: boolean;
  errors?: Array<{ step: string; message: string }>;
  accountTimeZone?: string;
  primaryTimeZone?: string;
}

export interface CalendarListResponse {
  calendars: GoogleCalendar[];
}

// Appointments API Types
export interface BookAppointmentRequest {
  organizationId: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  start: string;
  end: string;
  notes?: string;
  calendarId?: string;
}

export interface BookAppointmentResponse {
  appointment?: {
    id: string;
    start: string;
    end: string;
    summary: string;
  };
  timeZone?: string;
  error?: string;
  start?: string;
  end?: string;
}

// Organization API Types
export interface DefaultOrgResponse {
  organization?: {
    id: string;
    name: string;
  };
}

// Realtime API Types
export interface RealtimeTokenRequest {
  systemPrompt: string;
  organizationId?: string;
  calendarId?: string;
  greeting?: string;
  language?: string;
  timeZone?: string;
}

export interface RealtimeTokenResponse {
  client_secret?: {
    value: string;
  };
  model?: string;
  error?: string;
}

// Google OAuth Types
export interface GoogleOAuthCallbackParams {
  code?: string;
  error?: string;
  state?: string;
}

// Webhook API Types
export interface TriggerCallRequest {
  phone: string;
  name?: string;
  systemPrompt?: string;
  greeting?: string;
  language?: string;
  agentId?: string;
}

export interface TriggerCallResponse {
  success?: boolean;
  callId?: string;
  error?: string;
}

// Agent API Types
export interface AgentConfigurationResponse {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  greeting: string;
  language?: string;
  agent_type?: string;
  max_tokens?: number;
  is_default?: boolean;
  is_demo?: boolean;
  created_at?: string;
  organization_id: string;
  system_prompt?: string;
  temperature?: number;
  top_p?: number;
  voice_id?: string;
}

// Demo Account Type
export interface DemoAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

// Error Types
export interface ApiError {
  error: string;
  message?: string;
  status?: number;
  detail?: unknown;
}

// HTTP Status Error
export interface HttpError extends ApiError {
  status: number;
  detail: unknown;
}
