export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      agent_calendars: {
        Row: {
          access_role: string | null
          agent_id: string
          background_color: string | null
          calendar_email: string | null
          calendar_id: string
          calendar_name: string | null
          created_at: string | null
          foreground_color: string | null
          id: string
          is_primary: boolean | null
          updated_at: string | null
        }
        Insert: {
          access_role?: string | null
          agent_id: string
          background_color?: string | null
          calendar_email?: string | null
          calendar_id: string
          calendar_name?: string | null
          created_at?: string | null
          foreground_color?: string | null
          id?: string
          is_primary?: boolean | null
          updated_at?: string | null
        }
        Update: {
          access_role?: string | null
          agent_id?: string
          background_color?: string | null
          calendar_email?: string | null
          calendar_id?: string
          calendar_name?: string | null
          created_at?: string | null
          foreground_color?: string | null
          id?: string
          is_primary?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_calendars_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_calendars_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "organization_demo_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_configurations: {
        Row: {
          agent_type: string | null
          created_at: string | null
          description: string | null
          display_name: string | null
          greeting: string
          id: string
          is_default: boolean | null
          is_demo: boolean | null
          language: string | null
          max_tokens: number | null
          name: string
          organization_id: string
          prompt: string
          temperature: number | null
          updated_at: string | null
          voice: string | null
          webhook_enabled: boolean | null
          webhook_token: string | null
          webhook_url: string | null
        }
        Insert: {
          agent_type?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          greeting: string
          id?: string
          is_default?: boolean | null
          is_demo?: boolean | null
          language?: string | null
          max_tokens?: number | null
          name?: string
          organization_id: string
          prompt: string
          temperature?: number | null
          updated_at?: string | null
          voice?: string | null
          webhook_enabled?: boolean | null
          webhook_token?: string | null
          webhook_url?: string | null
        }
        Update: {
          agent_type?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          greeting?: string
          id?: string
          is_default?: boolean | null
          is_demo?: boolean | null
          language?: string | null
          max_tokens?: number | null
          name?: string
          organization_id?: string
          prompt?: string
          temperature?: number | null
          updated_at?: string | null
          voice?: string | null
          webhook_enabled?: boolean | null
          webhook_token?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_twilio_settings: {
        Row: {
          account_sid: string
          agent_id: string
          auth_token_encrypted: string
          created_at: string
          encryption_version: string
          id: string
          organization_id: string
          phone_number: string
          updated_at: string
        }
        Insert: {
          account_sid: string
          agent_id: string
          auth_token_encrypted: string
          created_at?: string
          encryption_version?: string
          id?: string
          organization_id: string
          phone_number: string
          updated_at?: string
        }
        Update: {
          account_sid?: string
          agent_id?: string
          auth_token_encrypted?: string
          created_at?: string
          encryption_version?: string
          id?: string
          organization_id?: string
          phone_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_twilio_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_twilio_agent_id_configurations"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_twilio_agent_id_configurations"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "organization_demo_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          call_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          google_event_id: string | null
          id: string
          notes: string | null
          organization_id: string | null
          scheduled_end: string
          scheduled_start: string
          status: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          scheduled_end: string
          scheduled_start: string
          status?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          scheduled_end?: string
          scheduled_start?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          id: string
          organization_id: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          agent_id: string | null
          call_sid: string | null
          created_at: string | null
          direction: string
          duration: number | null
          from_number: string
          id: string
          metadata: Json | null
          organization_id: string
          status: string
          to_number: string
          updated_at: string | null
          webhook_triggered: boolean | null
        }
        Insert: {
          agent_id?: string | null
          call_sid?: string | null
          created_at?: string | null
          direction: string
          duration?: number | null
          from_number: string
          id?: string
          metadata?: Json | null
          organization_id: string
          status: string
          to_number: string
          updated_at?: string | null
          webhook_triggered?: boolean | null
        }
        Update: {
          agent_id?: string | null
          call_sid?: string | null
          created_at?: string | null
          direction?: string
          duration?: number | null
          from_number?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          status?: string
          to_number?: string
          updated_at?: string | null
          webhook_triggered?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "organization_demo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          ai_summary: string | null
          appointment_booked: boolean | null
          call_sid: string | null
          caller_phone: string
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          organization_id: string | null
          recording_url: string | null
          started_at: string | null
          status: string | null
          transcript: Json | null
        }
        Insert: {
          agent_id?: string | null
          ai_summary?: string | null
          appointment_booked?: boolean | null
          call_sid?: string | null
          caller_phone: string
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          transcript?: Json | null
        }
        Update: {
          agent_id?: string | null
          ai_summary?: string | null
          appointment_booked?: boolean | null
          call_sid?: string | null
          caller_phone?: string
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_calls_agent_id_agent_configurations"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_calls_agent_id_agent_configurations"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "organization_demo_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          buffer_minutes: number
          default_slot_minutes: number
          organization_id: string
        }
        Insert: {
          buffer_minutes?: number
          default_slot_minutes?: number
          organization_id: string
        }
        Update: {
          buffer_minutes?: number
          default_slot_minutes?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          business_hours: Json | null
          created_at: string | null
          id: string
          name: string
          phone_number: string | null
          settings: Json | null
          timezone: string | null
          updated_at: string | null
          webhook_auto_disabled_at: string | null
          webhook_created_at: string | null
          webhook_enabled: boolean | null
          webhook_failures: number | null
          webhook_last_failure_at: string | null
          webhook_rate_limit_per_hour: number | null
          webhook_rate_limit_per_minute: number | null
          webhook_rotated_at: string | null
          webhook_secret_encrypted: string | null
          webhook_token: string | null
        }
        Insert: {
          business_hours?: Json | null
          created_at?: string | null
          id?: string
          name: string
          phone_number?: string | null
          settings?: Json | null
          timezone?: string | null
          updated_at?: string | null
          webhook_auto_disabled_at?: string | null
          webhook_created_at?: string | null
          webhook_enabled?: boolean | null
          webhook_failures?: number | null
          webhook_last_failure_at?: string | null
          webhook_rate_limit_per_hour?: number | null
          webhook_rate_limit_per_minute?: number | null
          webhook_rotated_at?: string | null
          webhook_secret_encrypted?: string | null
          webhook_token?: string | null
        }
        Update: {
          business_hours?: Json | null
          created_at?: string | null
          id?: string
          name?: string
          phone_number?: string | null
          settings?: Json | null
          timezone?: string | null
          updated_at?: string | null
          webhook_auto_disabled_at?: string | null
          webhook_created_at?: string | null
          webhook_enabled?: boolean | null
          webhook_failures?: number | null
          webhook_last_failure_at?: string | null
          webhook_rate_limit_per_hour?: number | null
          webhook_rate_limit_per_minute?: number | null
          webhook_rotated_at?: string | null
          webhook_secret_encrypted?: string | null
          webhook_token?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          done: boolean
          due_date: string
          id: number
          name: string
          user_id: string
        }
        Insert: {
          done: boolean
          due_date: string
          id?: never
          name: string
          user_id: string
        }
        Update: {
          done?: boolean
          due_date?: string
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      twilio_settings: {
        Row: {
          account_sid: string
          auth_token: string
          created_at: string | null
          id: string
          organization_id: string
          phone_number: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_sid: string
          auth_token: string
          created_at?: string | null
          id?: string
          organization_id: string
          phone_number: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_sid?: string
          auth_token?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          phone_number?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "twilio_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          onboarded: boolean
          photo_url: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          onboarded: boolean
          photo_url?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          onboarded?: boolean
          photo_url?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          ip_address: unknown | null
          organization_id: string | null
          processing_time_ms: number | null
          request_body: Json | null
          request_headers: Json | null
          response_status: number | null
          success: boolean | null
          user_agent: string | null
          webhook_token: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: unknown | null
          organization_id?: string | null
          processing_time_ms?: number | null
          request_body?: Json | null
          request_headers?: Json | null
          response_status?: number | null
          success?: boolean | null
          user_agent?: string | null
          webhook_token?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: unknown | null
          organization_id?: string | null
          processing_time_ms?: number | null
          request_body?: Json | null
          request_headers?: Json | null
          response_status?: number | null
          success?: boolean | null
          user_agent?: string | null
          webhook_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_rate_limits: {
        Row: {
          hour_bucket: string
          hour_count: number | null
          last_reset_at: string | null
          minute_bucket: string
          minute_count: number | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          hour_bucket: string
          hour_count?: number | null
          last_reset_at?: string | null
          minute_bucket: string
          minute_count?: number | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          hour_bucket?: string
          hour_count?: number | null
          last_reset_at?: string | null
          minute_bucket?: string
          minute_count?: number | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_rate_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      organization_demo_agents: {
        Row: {
          agent_type: string | null
          created_at: string | null
          description: string | null
          display_name: string | null
          greeting: string | null
          id: string | null
          is_default: boolean | null
          is_demo: boolean | null
          language: string | null
          max_tokens: number | null
          name: string | null
          organization_id: string | null
          organization_name: string | null
          organization_phone: string | null
          organization_timezone: string | null
          prompt: string | null
          temperature: number | null
          updated_at: string | null
          voice: string | null
          webhook_enabled: boolean | null
          webhook_token: string | null
          webhook_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_webhook_rate_limit: {
        Args: {
          p_hour_limit: number
          p_minute_limit: number
          p_organization_id: string
        }
        Returns: boolean
      }
      create_organization_for_user: {
        Args: { org_name: string; user_id: string }
        Returns: string
      }
      decrypt_google_token: {
        Args: { agent_id: string; encrypted_token: string }
        Returns: string
      }
      disconnect_agent_google_calendar: {
        Args: { p_agent_id: string }
        Returns: boolean
      }
      encrypt_google_token: {
        Args: { agent_id: string; token: string }
        Returns: string
      }
      gbt_bit_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_bool_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_bool_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_bpchar_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_bytea_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_cash_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_cash_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_date_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_date_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_enum_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_enum_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_float4_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_float4_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_float8_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_float8_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_inet_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_int2_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_int2_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_int4_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_int4_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_int8_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_int8_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_intv_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_intv_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_intv_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_macad_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_macad_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_macad8_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_macad8_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_numeric_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_oid_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_oid_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_text_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_time_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_time_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_timetz_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_ts_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_ts_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_tstz_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_uuid_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_uuid_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_var_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbt_var_fetch: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey_var_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey_var_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey16_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey16_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey2_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey2_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey32_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey32_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey4_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey4_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey8_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gbtreekey8_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      generate_webhook_secret: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_webhook_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_agent_google_tokens: {
        Args: { p_agent_id: string }
        Returns: {
          access_token: string
          calendar_email: string
          calendar_id: string
          connected: boolean
          is_expired: boolean
          refresh_token: string
          token_expiry: number
        }[]
      }
      get_user_default_organization: {
        Args: { user_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_user_organizations: {
        Args: { user_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          role: string
        }[]
      }
      has_permission: {
        Args: { p_org_id: string; p_permission: string; p_user_id: string }
        Returns: boolean
      }
      store_agent_google_tokens: {
        Args: {
          p_access_token: string
          p_agent_id: string
          p_calendar_id?: string
          p_email?: string
          p_expires_in: number
          p_refresh_token: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
