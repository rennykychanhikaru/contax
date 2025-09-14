export interface AgentData {
  organization_id: string;
  name?: string;
  display_name?: string;
  prompt?: string;
  greeting?: string;
  language?: string;
  temperature?: number;
  max_tokens?: number;
  webhook_enabled?: boolean;
  webhook_token?: string;
  webhook_url?: string;
  response_type?: string;
  voice_config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export interface UpdateData {
  updated_at: string;
  updated_by?: string;
  display_name?: string;
  prompt?: string;
  greeting?: string;
  language?: string;
  temperature?: number;
  max_tokens?: number;
  webhook_enabled?: boolean;
  webhook_token?: string;
  webhook_url?: string;
  name?: string;
  description?: string;
  system_prompt?: string;
  greeting_message?: string;
  voice_settings?: Record<string, unknown>;
  is_default?: boolean;
  is_active?: boolean;
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

export interface GoogleCalendar {
  kind: string;
  etag: string;
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  accessRole: string;
  primary?: boolean;
  selected?: boolean;
}

export interface TimeSlot {
  start: string;
  end: string;
}

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
