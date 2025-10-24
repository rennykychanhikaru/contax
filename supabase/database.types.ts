export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_user: {
        Row: {
          account_id: string
          created_at: string
          email: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          id?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_user_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_break_glass_overrides: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string
          id: string
          issued_by: string
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at: string
          id?: string
          issued_by: string
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_break_glass_overrides_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          id: string
          is_disabled: boolean
          is_super_admin: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          id: string
          is_disabled?: boolean
          is_super_admin?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          id?: string
          is_disabled?: boolean
          is_super_admin?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_api_aggregates: {
        Row: {
          avg_duration_ms: string
          bucket: string
          error_count: number
          method: string
          path: string
          p95_duration_ms: string
          total_requests: number
        }
        Insert: {
          avg_duration_ms: string
          bucket: string
          error_count: number
          method: string
          path: string
          p95_duration_ms: string
          total_requests: number
        }
        Update: {
          avg_duration_ms?: string
          bucket?: string
          error_count?: number
          method?: string
          path?: string
          p95_duration_ms?: string
          total_requests?: number
        }
        Relationships: []
      }
      admin_api_events: {
        Row: {
          admin_user_id: string | null
          duration_ms: number | null
          id: string
          ip_address: string | null
          metadata: Json | null
          method: string
          occurred_at: string
          path: string
          status: number
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          admin_user_id?: string | null
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          method: string
          occurred_at?: string
          path: string
          status: number
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string | null
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          method?: string
          occurred_at?: string
          path?: string
          status?: number
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
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
          google_calendar_access_token_encrypted: string | null
          google_calendar_connected: boolean | null
          google_calendar_connected_at: string | null
          google_calendar_email: string | null
          google_calendar_id: string | null
          google_calendar_last_sync: string | null
          google_calendar_refresh_token_encrypted: string | null
          google_calendar_token_expiry: number | null
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
          voice: string | null
          voice_fallback_enabled: boolean | null
          voice_provider: string | null
          elevenlabs_voice_id: string | null
          elevenlabs_voice_settings: Json | null
          updated_at: string | null
          webhook_enabled: boolean | null
          webhook_token: string | null
          webhook_url: string | null
        }
        Insert: {
          agent_type?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          google_calendar_access_token_encrypted?: string | null
          google_calendar_connected?: boolean | null
          google_calendar_connected_at?: string | null
          google_calendar_email?: string | null
          google_calendar_id?: string | null
          google_calendar_last_sync?: string | null
          google_calendar_refresh_token_encrypted?: string | null
          google_calendar_token_expiry?: number | null
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
          voice?: string | null
          voice_fallback_enabled?: boolean | null
          voice_provider?: string | null
          elevenlabs_voice_id?: string | null
          elevenlabs_voice_settings?: Json | null
          updated_at?: string | null
          webhook_enabled?: boolean | null
          webhook_token?: string | null
          webhook_url?: string | null
        }
        Update: {
          agent_type?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          google_calendar_access_token_encrypted?: string | null
          google_calendar_connected?: boolean | null
          google_calendar_connected_at?: string | null
          google_calendar_email?: string | null
          google_calendar_id?: string | null
          google_calendar_last_sync?: string | null
          google_calendar_refresh_token_encrypted?: string | null
          google_calendar_token_expiry?: number | null
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
          voice?: string | null
          voice_fallback_enabled?: boolean | null
          voice_provider?: string | null
          elevenlabs_voice_id?: string | null
          elevenlabs_voice_settings?: Json | null
          updated_at?: string | null
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
            foreignKeyName: "agent_twilio_settings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_twilio_settings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "organization_demo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_twilio_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
        ]
      }
      feature_flag_overrides: {
        Row: {
          account_id: string | null
          created_at: string
          feature_flag_id: string
          id: string
          is_enabled: boolean
          metadata: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          feature_flag_id: string
          id?: string
          is_enabled: boolean
          metadata?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          feature_flag_id?: string
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_overrides_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_overrides_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          feature_flag_id: string
          id: string
          metadata: Json | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_flag_id: string
          id?: string
          metadata?: Json | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_flag_id?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_feature_flags_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_feature_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_addons: {
        Row: {
          activated_at: string | null
          addon_type: string
          billing_status: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          metadata: Json | null
          organization_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          addon_type: string
          billing_status?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          addon_type?: string
          billing_status?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_usage_logs: {
        Row: {
          agent_id: string | null
          call_id: string | null
          character_count: number | null
          cost_cents: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          organization_id: string
          session_id: string | null
          voice_id: string | null
          voice_provider: string
        }
        Insert: {
          agent_id?: string | null
          call_id?: string | null
          character_count?: number | null
          cost_cents?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          organization_id: string
          session_id?: string | null
          voice_id?: string | null
          voice_provider: string
        }
        Update: {
          agent_id?: string | null
          call_id?: string | null
          character_count?: number | null
          cost_cents?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          organization_id?: string
          session_id?: string | null
          voice_id?: string | null
          voice_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_usage_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_usage_logs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          flag_key: string
          flag_name: string
          id: string
          is_enabled: boolean
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          flag_key: string
          flag_name: string
          id?: string
          is_enabled?: boolean
          target_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          flag_key?: string
          flag_name?: string
          id?: string
          is_enabled?: boolean
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      feature_flag_usage_events: {
        Row: {
          account_id: string | null
          evaluated_at: string
          feature_flag_id: string | null
          flag_key: string
          id: string
          metadata: Json | null
          source: string
          user_id: string | null
          was_enabled: boolean
        }
        Insert: {
          account_id?: string | null
          evaluated_at?: string
          feature_flag_id?: string | null
          flag_key: string
          id?: string
          metadata?: Json | null
          source?: string
          user_id?: string | null
          was_enabled: boolean
        }
        Update: {
          account_id?: string | null
          evaluated_at?: string
          feature_flag_id?: string | null
          flag_key?: string
          id?: string
          metadata?: Json | null
          source?: string
          user_id?: string | null
          was_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_usage_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_usage_events_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
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
      admin_api_latency_summary: {
        Row: {
          avg_duration_ms: string | null
          bucket: string | null
          error_count: number | null
          method: string | null
          path: string | null
          p95_duration_ms: string | null
          total_requests: number | null
        }
        Relationships: []
      }
      admin_account_usage_summary: {
        Row: {
          account_id: string | null
          last_30d_calls: number | null
          last_7d_calls: number | null
          last_call_at: string | null
          name: string | null
          total_calls: number | null
        }
        Relationships: []
      }
      feature_flag_usage_summary: {
        Row: {
          bucket: string | null
          enabled_checks: number | null
          flag_key: string | null
          total_checks: number | null
        }
        Relationships: []
      }
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
          p_organization_id: string
          p_minute_limit: number
          p_hour_limit: number
        }
        Returns: boolean
      }
      create_organization_for_user: {
        Args: {
          user_id: string
          org_name: string
        }
        Returns: string
      }
      decrypt_google_token: {
        Args: {
          encrypted_token: string
          agent_id: string
        }
        Returns: string
      }
      disable_account: {
        Args: {
          target_account_id: string
          reason: string
          admin_user_id: string
        }
        Returns: boolean
      }
      has_break_glass_access: {
        Args: {
          p_account_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      disconnect_agent_google_calendar: {
        Args: {
          p_agent_id: string
        }
        Returns: boolean
      }
      encrypt_google_token: {
        Args: {
          token: string
          agent_id: string
        }
        Returns: string
      }
      gbt_bit_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bool_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bool_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bpchar_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bytea_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_cash_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_cash_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_date_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_date_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_enum_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_enum_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float4_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float4_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float8_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float8_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_inet_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int2_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int2_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int4_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int4_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int8_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int8_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_intv_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_intv_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_intv_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad8_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad8_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_numeric_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_oid_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_oid_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_text_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_time_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_time_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_timetz_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_ts_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_ts_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_tstz_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_uuid_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_uuid_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_var_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_var_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey_var_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey_var_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey16_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey16_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey2_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey2_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey32_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey32_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey4_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey4_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey8_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey8_out: {
        Args: {
          "": unknown
        }
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
        Args: {
          p_agent_id: string
        }
        Returns: {
          access_token: string
          refresh_token: string
          token_expiry: number
          is_expired: boolean
          calendar_email: string
          calendar_id: string
          connected: boolean
        }[]
      }
      get_user_default_organization: {
        Args: {
          user_id: string
        }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_user_organizations: {
        Args: {
          user_id: string
        }
        Returns: {
          id: string
          name: string
          role: string
          created_at: string
        }[]
      }
      has_permission: {
        Args: {
          p_user_id: string
          p_org_id: string
          p_permission: string
        }
        Returns: boolean
      }
      is_feature_enabled: {
        Args: {
          flag_key: string
          check_account_id?: string
          check_user_id?: string
        }
        Returns: boolean
      }
      is_super_admin: {
        Args: {
          user_id: string
        }
        Returns: boolean
      }
      store_agent_google_tokens: {
        Args: {
          p_agent_id: string
          p_access_token: string
          p_refresh_token: string
          p_expires_in: number
          p_email?: string
          p_calendar_id?: string
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
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          format: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          format?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          level: number | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      prefixes: {
        Row: {
          bucket_id: string
          created_at: string | null
          level: number
          name: string
          updated_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string | null
          level?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string | null
          level?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prefixes_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_prefixes: {
        Args: {
          _bucket_id: string
          _name: string
        }
        Returns: undefined
      }
      can_insert_object: {
        Args: {
          bucketid: string
          name: string
          owner: string
          metadata: Json
        }
        Returns: undefined
      }
      delete_prefix: {
        Args: {
          _bucket_id: string
          _name: string
        }
        Returns: boolean
      }
      extension: {
        Args: {
          name: string
        }
        Returns: string
      }
      filename: {
        Args: {
          name: string
        }
        Returns: string
      }
      foldername: {
        Args: {
          name: string
        }
        Returns: string[]
      }
      get_level: {
        Args: {
          name: string
        }
        Returns: number
      }
      get_prefix: {
        Args: {
          name: string
        }
        Returns: string
      }
      get_prefixes: {
        Args: {
          name: string
        }
        Returns: string[]
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          size: number
          bucket_id: string
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
        }
        Returns: {
          key: string
          id: string
          created_at: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          start_after?: string
          next_token?: string
        }
        Returns: {
          name: string
          id: string
          metadata: Json
          updated_at: string
        }[]
      }
      operation: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_legacy_v1: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_v1_optimised: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_v2: {
        Args: {
          prefix: string
          bucket_name: string
          limits?: number
          levels?: number
          start_after?: string
        }
        Returns: {
          key: string
          name: string
          id: string
          updated_at: string
          created_at: string
          metadata: Json
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
