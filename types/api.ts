// API Request/Response Types for Contax

// Common API response wrapper
export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
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
  conflicts?: Array<{ start: string; end: string }>;
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
  slots: Array<{ start: string; end: string }>;
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
  calendars: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    accessRole?: string;
    selected?: boolean;
    timeZone?: string;
    backgroundColor?: string;
    foregroundColor?: string;
  }>;
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