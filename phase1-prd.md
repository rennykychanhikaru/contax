# Phase 1 PRD: Foundation (Months 1-3)

## Core Voice Processing & Basic Scheduling

### Executive Summary

Phase 1 establishes the foundational infrastructure for your AI voice answering service. The primary goal is to build a working prototype that can handle basic inbound calls, conduct natural conversations, and schedule simple appointments. This phase prioritizes reliability and core functionality over advanced features, focusing on proving the technical viability and achieving product-market fit with initial beta customers.

The implementation leverages Supabase as the primary backend infrastructure, combining its PostgreSQL database, real-time subscriptions, authentication, and edge functions to minimize external dependencies. By the end of Phase 1, you'll have a system capable of handling 100 concurrent calls with basic scheduling functionality integrated with Google Calendar.

### Technical Architecture for Phase 1

#### Simplified Service Provider Stack

To minimize complexity and vendor dependencies, we're consolidating around these core providers:

```yaml
Core Infrastructure:
  Database & Backend: Supabase
    - PostgreSQL database with RLS
    - Edge Functions for serverless compute
    - Realtime subscriptions for live updates
    - Built-in authentication
    - Vector storage for basic RAG (pg_vector)

  Voice Infrastructure:
    Primary: LiveKit Cloud
    - WebRTC infrastructure
    - TURN/STUN servers included
    - Auto-scaling built in

  AI Services:
    LLM: OpenAI (GPT-4-turbo for now, cheaper than Realtime API initially)
    STT: Deepgram
    TTS: OpenAI TTS (simpler than ElevenLabs for MVP)

  Telephony: Twilio
    - Phone number provisioning
    - PSTN connectivity
    - SMS for confirmations

  Calendar: Google Calendar API
    - Direct API integration
    - OAuth2 authentication
```

### Database Schema Design in Supabase

Understanding how we'll structure our data is crucial for success. Supabase uses PostgreSQL, which gives us powerful features like Row Level Security (RLS) for multi-tenancy right out of the box. Here's how we'll organize our core tables:

```sql
-- Enable necessary extensions in Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron"; -- For scheduled jobs
CREATE EXTENSION IF NOT EXISTS "vector"; -- For embeddings (basic RAG)

-- Organizations table (our tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone_number TEXT UNIQUE, -- Their Twilio number
    timezone TEXT DEFAULT 'America/New_York',
    business_hours JSONB DEFAULT '{"monday": {"start": "09:00", "end": "17:00"}}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends Supabase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    organization_id UUID REFERENCES organizations(id),i know
    role TEXT CHECK (role IN ('owner', 'admin', 'user')),
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calls table for tracking all interactions
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    call_sid TEXT UNIQUE, -- Twilio Call SID
    caller_phone TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    status TEXT DEFAULT 'in_progress',
    recording_url TEXT,
    transcript JSONB,
    ai_summary TEXT,
    appointment_booked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    call_id UUID REFERENCES calls(id),
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'confirmed',
    google_event_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent double booking
    EXCLUDE USING gist (
        organization_id WITH =,
        tstzrange(scheduled_start, scheduled_end) WITH &&
    ) WHERE (status != 'cancelled')
);

-- Simple knowledge base for each organization
CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI embeddings
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own organization" ON organizations
    FOR ALL USING (id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Users can manage own organization data" ON calls
    FOR ALL USING (organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

-- Similar policies for other tables...
```

### Core Voice Processing Implementation

Let me walk you through how the voice processing pipeline works. When a call comes in, we need to handle multiple concurrent processes: receiving audio, transcribing it, generating responses, and synthesizing speech. Here's the detailed implementation:

```javascript
// Supabase Edge Function: handle-incoming-call.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { LiveKit } from 'https://esm.sh/livekit-server-sdk@1.2.0'

serve(async (req) => {
  const { CallSid, From, To } = await req.json()

  // Initialize Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_KEY')!
  )

  // Find organization by phone number
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('phone_number', To)
    .single()

  if (!org) {
    return new Response('Organization not found', { status: 404 })
  }

  // Create call record
  const { data: call } = await supabase
    .from('calls')
    .insert({
      organization_id: org.id,
      call_sid: CallSid,
      caller_phone: From,
      status: 'connecting'
    })
    .select()
    .single()

  // Generate LiveKit token for this call
  const livekit = new LiveKit({
    apiKey: Deno.env.get('LIVEKIT_API_KEY')!,
    apiSecret: Deno.env.get('LIVEKIT_API_SECRET')!,
  })

  const token = livekit.createToken({
    identity: CallSid,
    metadata: JSON.stringify({
      organization_id: org.id,
      call_id: call.id
    })
  })

  // Return TwiML to connect call to LiveKit
  const twiml = `
    <Response>
      <Say>Thank you for calling ${org.name}. One moment please.</Say>
      <Connect>
        <Stream url="wss://your-livekit-url.com">
          <Parameter name="token" value="${token}" />
        </Stream>
      </Connect>
    </Response>
  `

  return new Response(twiml, {
    headers: { 'Content-Type': 'application/xml' }
  })
})
```

Now, here's the critical voice processing service that handles the actual conversation. This is where the magic happens - we're creating a real-time pipeline that feels natural to callers:

```python
# voice_processor.py - Core conversation engine
import asyncio
import json
from datetime import datetime
from typing import Optional, Dict, Any
import numpy as np

class VoiceProcessor:
    """
    This is the heart of our system. It manages the entire conversation flow,
    from receiving audio to generating responses. Think of it as the brain
    that coordinates all the different AI services.
    """

    def __init__(self, organization_id: str, call_id: str):
        self.organization_id = organization_id
        self.call_id = call_id
        self.conversation_history = []
        self.deepgram = DeepgramClient()
        self.openai = OpenAIClient()
        self.supabase = SupabaseClient()

        # Load organization context
        self.context = self._load_organization_context()

        # Voice activity detection parameters
        self.silence_threshold = 0.01  # Amplitude threshold
        self.silence_duration = 1.5     # Seconds of silence before processing
        self.last_audio_time = None

    async def _load_organization_context(self) -> Dict[str, Any]:
        """
        Load all relevant information about the business.
        This includes business hours, services, pricing, etc.
        """
        org = await self.supabase.get_organization(self.organization_id)
        knowledge = await self.supabase.get_knowledge_base(self.organization_id)

        # Create a context prompt for the AI
        context = f"""
        You are an AI receptionist for {org['name']}.
        Business Hours: {org['business_hours']}
        Timezone: {org['timezone']}

        Important Information:
        {' '.join([k['content'] for k in knowledge])}

        Your job is to:
        1. Answer questions about the business
        2. Schedule appointments when requested
        3. Be friendly and professional
        4. Transfer to a human if you can't help
        """
        return context

    async def process_audio_stream(self, audio_chunk: bytes) -> Optional[bytes]:
        """
        Process incoming audio in real-time.
        This method is called continuously as audio arrives.
        """
        # Detect if user is speaking or silent
        audio_amplitude = np.frombuffer(audio_chunk, dtype=np.int16).max()

        if audio_amplitude > self.silence_threshold:
            self.last_audio_time = datetime.now()
            # Add to buffer for transcription
            self.audio_buffer.append(audio_chunk)
        else:
            # Check if we have enough silence to process
            if self.last_audio_time and \
               (datetime.now() - self.last_audio_time).seconds > self.silence_duration:
                # User has stopped speaking, process their input
                return await self._process_complete_utterance()

        return None

    async def _process_complete_utterance(self) -> bytes:
        """
        This is called when we detect the user has finished speaking.
        We transcribe, understand, generate response, and synthesize.
        """
        # Step 1: Transcribe the audio
        audio_data = b''.join(self.audio_buffer)
        transcript = await self.deepgram.transcribe(audio_data)

        # Clear buffer for next utterance
        self.audio_buffer = []

        # Step 2: Add to conversation history
        self.conversation_history.append({
            'role': 'user',
            'content': transcript,
            'timestamp': datetime.now()
        })

        # Step 3: Detect intent and extract entities
        intent = await self._detect_intent(transcript)

        # Step 4: Generate appropriate response
        if intent['type'] == 'scheduling':
            response_text = await self._handle_scheduling_request(intent)
        elif intent['type'] == 'question':
            response_text = await self._handle_question(transcript)
        else:
            response_text = await self._generate_general_response(transcript)

        # Step 5: Synthesize speech
        audio_response = await self.openai.text_to_speech(response_text)

        # Step 6: Update conversation history and database
        self.conversation_history.append({
            'role': 'assistant',
            'content': response_text,
            'timestamp': datetime.now()
        })

        await self._update_call_transcript()

        return audio_response

    async def _detect_intent(self, transcript: str) -> Dict[str, Any]:
        """
        Use GPT to understand what the caller wants.
        This is more reliable than rule-based intent detection.
        """
        prompt = f"""
        Analyze this customer request and extract the intent:
        "{transcript}"

        Possible intents:
        - scheduling: wants to book an appointment
        - question: asking about services, prices, hours
        - complaint: expressing dissatisfaction
        - emergency: urgent situation

        Also extract any entities like:
        - dates/times mentioned
        - services requested
        - contact information

        Return as JSON.
        """

        response = await self.openai.complete(prompt, response_format="json")
        return json.loads(response)

    async def _handle_scheduling_request(self, intent: Dict) -> str:
        """
        This is where scheduling logic happens.
        We check availability and book appointments.
        """
        # Extract desired time from intent
        requested_time = intent.get('entities', {}).get('time')

        if not requested_time:
            # Ask for preferred time
            return "I'd be happy to schedule an appointment for you. What day and time works best?"

        # Check availability in database
        available = await self._check_availability(requested_time)

        if available:
            # Create appointment
            appointment = await self.supabase.create_appointment({
                'organization_id': self.organization_id,
                'call_id': self.call_id,
                'scheduled_start': requested_time,
                'scheduled_end': requested_time + timedelta(hours=1),
                'customer_phone': self.caller_phone
            })

            # Sync with Google Calendar
            await self._sync_to_google_calendar(appointment)

            return f"Perfect! I've scheduled your appointment for {requested_time}. You'll receive a confirmation text shortly."
        else:
            # Suggest alternatives
            alternatives = await self._get_alternative_times(requested_time)
            return f"That time isn't available, but I have openings at {alternatives[0]} or {alternatives[1]}. Which would you prefer?"
```

### Google Calendar Integration

The calendar integration is crucial for preventing double-bookings and keeping everything synchronized. Here's how we implement a robust two-way sync:

```typescript
// Supabase Edge Function: calendar-sync.ts
import { OAuth2Client } from 'https://deno.land/x/google_api@v1/mod.ts'
import { calendar_v3 } from 'https://deno.land/x/google_api@v1/calendar/v3.ts'

export class CalendarIntegration {
  private oauth2Client: OAuth2Client
  private calendar: calendar_v3.Calendar
  private supabase: SupabaseClient

  constructor(organizationId: string) {
    // Initialize OAuth2 client with stored tokens
    this.oauth2Client = new OAuth2Client({
      clientId: Deno.env.get('GOOGLE_CLIENT_ID'),
      clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET'),
      redirectUri: 'https://yourapp.com/auth/callback'
    })

    // Load stored tokens from Supabase
    this.loadStoredTokens(organizationId)

    // Initialize calendar client
    this.calendar = new calendar_v3.Calendar({
      auth: this.oauth2Client
    })
  }

  async checkAvailability(
    startTime: Date,
    endTime: Date,
    calendarId: string = 'primary'
  ): Promise<boolean> {
    """
    This method checks if a time slot is available.
    We query both Google Calendar and our database to ensure consistency.
    """

    // First, check Google Calendar
    const freeBusyResponse = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: calendarId }]
      }
    })

    const busySlots = freeBusyResponse.data.calendars[calendarId].busy || []

    // Check if requested time overlaps with any busy slot
    for (const slot of busySlots) {
      const slotStart = new Date(slot.start)
      const slotEnd = new Date(slot.end)

      if (this.timeSlotsOverlap(startTime, endTime, slotStart, slotEnd)) {
        return false // Time is not available
      }
    }

    // Also check our database for any pending appointments
    const { data: conflicts } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('organization_id', this.organizationId)
      .gte('scheduled_start', startTime.toISOString())
      .lte('scheduled_start', endTime.toISOString())
      .neq('status', 'cancelled')

    return conflicts.length === 0
  }

  async createCalendarEvent(appointment: Appointment): Promise<string> {
    """
    Creates an event in Google Calendar and returns the event ID.
    This ensures the business owner sees appointments in their calendar.
    """

    const event = {
      summary: `Appointment: ${appointment.customer_name || 'Customer'}`,
      description: `
        Phone: ${appointment.customer_phone}
        ${appointment.notes ? `Notes: ${appointment.notes}` : ''}
        Booked via AI Assistant
      `,
      start: {
        dateTime: appointment.scheduled_start,
        timeZone: this.organizationTimezone
      },
      end: {
        dateTime: appointment.scheduled_end,
        timeZone: this.organizationTimezone
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 }
        ]
      }
    }

    const response = await this.calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    })

    // Update appointment with Google Event ID
    await this.supabase
      .from('appointments')
      .update({ google_event_id: response.data.id })
      .eq('id', appointment.id)

    return response.data.id
  }

  async syncFromGoogleCalendar(): Promise<void> {
    """
    This runs periodically to pull changes from Google Calendar.
    It ensures appointments created directly in Google Calendar
    are reflected in our system.
    """

    // Get sync token from last sync
    const { data: syncData } = await this.supabase
      .from('sync_tokens')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('service', 'google_calendar')
      .single()

    const syncToken = syncData?.token

    // Fetch changes since last sync
    const response = await this.calendar.events.list({
      calendarId: 'primary',
      syncToken: syncToken,
      maxResults: 100
    })

    // Process each changed event
    for (const event of response.data.items || []) {
      await this.processCalendarEvent(event)
    }

    // Store new sync token
    if (response.data.nextSyncToken) {
      await this.supabase
        .from('sync_tokens')
        .upsert({
          organization_id: this.organizationId,
          service: 'google_calendar',
          token: response.data.nextSyncToken
        })
    }
  }
}
```

### Webhook Handlers and Real-time Updates

Understanding how different services communicate is essential. We use webhooks to handle real-time events from Twilio and push updates to the frontend using Supabase Realtime:

```typescript
// Supabase Edge Function: webhook-handler.ts
serve(async (req) => {
  const path = new URL(req.url).pathname

  // Route to appropriate handler
  switch (path) {
    case '/webhooks/twilio/voice':
      return handleTwilioVoiceWebhook(req)
    case '/webhooks/twilio/status':
      return handleTwilioStatusWebhook(req)
    case '/webhooks/calendar/sync':
      return handleCalendarSync(req)
    default:
      return new Response('Not Found', { status: 404 })
  }
})

async function handleTwilioStatusWebhook(req: Request): Response {
  """
  This webhook fires when call status changes.
  We use it to track call duration and cleanup resources.
  """

  const data = await req.formData()
  const callSid = data.get('CallSid')
  const callStatus = data.get('CallStatus')
  const duration = data.get('CallDuration')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_KEY')!
  )

  if (callStatus === 'completed') {
    // Update call record
    await supabase
      .from('calls')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        duration_seconds: parseInt(duration)
      })
      .eq('call_sid', callSid)

    // Generate AI summary of the call
    const { data: call } = await supabase
      .from('calls')
      .select('transcript')
      .eq('call_sid', callSid)
      .single()

    if (call?.transcript) {
      const summary = await generateCallSummary(call.transcript)

      await supabase
        .from('calls')
        .update({ ai_summary: summary })
        .eq('call_sid', callSid)
    }

    // Notify frontend via Realtime
    await supabase.channel('calls')
      .send({
        type: 'broadcast',
        event: 'call_ended',
        payload: { call_sid: callSid }
      })
  }

  return new Response('OK', { status: 200 })
}

async function generateCallSummary(transcript: any): Promise<string> {
  """
  Uses GPT to create a concise summary of the call.
  This helps business owners quickly review calls.
  """

  const messages = transcript.messages || []
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n')

  const prompt = `
    Summarize this customer service call in 2-3 sentences:

    ${conversationText}

    Include:
    - Main reason for calling
    - Outcome/resolution
    - Any follow-up needed
  `

  const response = await openai.createCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150
  })

  return response.choices[0].message.content
}
```

### SMS Confirmation System

Here's how we send appointment confirmations and reminders using Twilio, integrated with Supabase Edge Functions:

```javascript
// Supabase Edge Function: send-confirmation.ts
import twilio from 'https://deno.land/x/twilio@0.1.0/mod.ts'

export async function sendAppointmentConfirmation(
  appointment: Appointment,
  organization: Organization
): Promise<void> {
  """
  Sends SMS confirmation immediately after booking.
  This reinforces the appointment and reduces no-shows.
  """

  const client = twilio(
    Deno.env.get('TWILIO_ACCOUNT_SID'),
    Deno.env.get('TWILIO_AUTH_TOKEN')
  )

  // Format appointment time in customer's timezone
  const appointmentTime = new Date(appointment.scheduled_start)
    .toLocaleString('en-US', {
      timeZone: organization.timezone,
      dateStyle: 'full',
      timeStyle: 'short'
    })

  const message = `
Hi! This confirms your appointment with ${organization.name} on ${appointmentTime}.

Reply C to cancel or R to reschedule.

Address: ${organization.address || 'Will be provided'}
  `.trim()

  try {
    await client.messages.create({
      body: message,
      from: organization.phone_number,
      to: appointment.customer_phone
    })

    // Log SMS sent
    await supabase
      .from('sms_logs')
      .insert({
        appointment_id: appointment.id,
        type: 'confirmation',
        sent_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('Failed to send SMS:', error)
    // Don't fail the appointment booking if SMS fails
  }
}

// Scheduled function for reminders (runs via pg_cron)
export async function sendAppointmentReminders(): Promise<void> {
  """
  This runs hourly to send reminders for upcoming appointments.
  We send reminders 24 hours and 1 hour before appointments.
  """

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_KEY')!
  )

  // Find appointments that need reminders
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      *,
      organization:organizations(*)
    `)
    .gte('scheduled_start', tomorrow.toISOString())
    .lte('scheduled_start', new Date(tomorrow.getTime() + 3600000).toISOString())
    .eq('status', 'confirmed')
    .is('reminder_sent_24h', null)

  for (const apt of appointments || []) {
    await sendReminderSMS(apt, '24_hour')
  }
}
```

### Frontend Dashboard (Simplified Admin Panel)

For Phase 1, we need a basic dashboard where business owners can monitor calls and manage appointments. Here's a simple React component using Supabase's real-time subscriptions:

```typescript
// Dashboard.tsx - Main admin interface
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function Dashboard() {
  const [calls, setCalls] = useState([])
  const [appointments, setAppointments] = useState([])
  const [stats, setStats] = useState({
    todaysCalls: 0,
    appointmentsBooked: 0,
    averageCallDuration: 0
  })

  useEffect(() => {
    """
    Set up real-time subscriptions to keep dashboard updated.
    This is the beauty of Supabase - real-time updates built in!
    """

    // Load initial data
    loadDashboardData()

    // Subscribe to real-time updates
    const callsSubscription = supabase
      .channel('calls-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calls'
      }, (payload) => {
        handleCallUpdate(payload)
      })
      .subscribe()

    const appointmentsSubscription = supabase
      .channel('appointments-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments'
      }, (payload) => {
        handleAppointmentUpdate(payload)
      })
      .subscribe()

    return () => {
      // Cleanup subscriptions
      supabase.removeChannel(callsSubscription)
      supabase.removeChannel(appointmentsSubscription)
    }
  }, [])

  async function loadDashboardData() {
    // Get today's calls
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: todaysCalls } = await supabase
      .from('calls')
      .select('*')
      .gte('started_at', today.toISOString())
      .order('started_at', { ascending: false })

    setCalls(todaysCalls || [])

    // Get upcoming appointments
    const { data: upcomingAppointments } = await supabase
      .from('appointments')
      .select('*')
      .gte('scheduled_start', new Date().toISOString())
      .order('scheduled_start')
      .limit(10)

    setAppointments(upcomingAppointments || [])

    // Calculate stats
    calculateStats(todaysCalls || [])
  }

  function handleCallUpdate(payload) {
    """
    Real-time update when a call status changes.
    This lets business owners see calls as they happen.
    """

    if (payload.eventType === 'INSERT') {
      setCalls(prev => [payload.new, ...prev])

      // Show notification for new call
      showNotification('New incoming call!', {
        body: `From: ${payload.new.caller_phone}`,
        icon: '/phone-icon.png'
      })
    } else if (payload.eventType === 'UPDATE') {
      setCalls(prev => prev.map(call =>
        call.id === payload.new.id ? payload.new : call
      ))

      // If call just ended, update stats
      if (payload.new.status === 'completed') {
        calculateStats([...calls, payload.new])
      }
    }
  }

  return (
    <div className="dashboard">
      <header>
        <h1>AI Receptionist Dashboard</h1>
        <div className="stats-bar">
          <div className="stat">
            <span className="label">Today's Calls</span>
            <span className="value">{stats.todaysCalls}</span>
          </div>
          <div className="stat">
            <span className="label">Appointments Booked</span>
            <span className="value">{stats.appointmentsBooked}</span>
          </div>
          <div className="stat">
            <span className="label">Avg Call Duration</span>
            <span className="value">{stats.averageCallDuration}s</span>
          </div>
        </div>
      </header>

      <div className="content-grid">
        <section className="active-calls">
          <h2>Recent Calls</h2>
          <CallsList calls={calls} />
        </section>

        <section className="upcoming-appointments">
          <h2>Upcoming Appointments</h2>
          <AppointmentsList appointments={appointments} />
        </section>
      </div>
    </div>
  )
}

function CallsList({ calls }) {
  return (
    <div className="calls-list">
      {calls.map(call => (
        <div key={call.id} className="call-item">
          <div className="call-header">
            <span className="phone">{call.caller_phone}</span>
            <span className={`status ${call.status}`}>
              {call.status === 'in_progress' ? '🔴 Active' : call.status}
            </span>
          </div>
          {call.ai_summary && (
            <p className="summary">{call.ai_summary}</p>
          )}
          <div className="call-actions">
            <button onClick={() => playRecording(call.recording_url)}>
              Play Recording
            </button>
            <button onClick={() => viewTranscript(call.id)}>
              View Transcript
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Configuration and Setup Interface

Business owners need a simple way to configure their AI receptionist. Here's the settings interface:

```typescript
// Settings.tsx - Configuration interface
export function Settings() {
  const [settings, setSettings] = useState({
    businessName: '',
    businessHours: {},
    timezone: 'America/New_York',
    voicePersonality: 'professional',
    customGreeting: '',
    knowledgeBase: []
  })

  async function saveSettings() {
    """
    Save settings to Supabase and update the AI's behavior.
    This is where customization happens for each business.
    """

    const { error } = await supabase
      .from('organizations')
      .update({
        name: settings.businessName,
        business_hours: settings.businessHours,
        timezone: settings.timezone,
        settings: {
          voice_personality: settings.voicePersonality,
          custom_greeting: settings.customGreeting
        }
      })
      .eq('id', organizationId)

    if (!error) {
      // Update knowledge base entries
      for (const item of settings.knowledgeBase) {
        await addToKnowledgeBase(item)
      }

      toast.success('Settings saved successfully!')
    }
  }

  async function addToKnowledgeBase(content: string) {
    """
    Add information to the AI's knowledge base.
    This gets embedded and used for answering questions.
    """

    // Generate embedding using OpenAI
    const embedding = await generateEmbedding(content)

    await supabase
      .from('knowledge_base')
      .insert({
        organization_id: organizationId,
        content: content,
        embedding: embedding
      })
  }

  return (
    <div className="settings-page">
      <h2>Configure Your AI Receptionist</h2>

      <section className="basic-settings">
        <h3>Basic Information</h3>
        <input
          type="text"
          placeholder="Business Name"
          value={settings.businessName}
          onChange={(e) => setSettings({
            ...settings,
            businessName: e.target.value
          })}
        />

        <BusinessHoursSelector
          hours={settings.businessHours}
          onChange={(hours) => setSettings({
            ...settings,
            businessHours: hours
          })}
        />
      </section>

      <section className="voice-settings">
        <h3>Voice Personality</h3>
        <select
          value={settings.voicePersonality}
          onChange={(e) => setSettings({
            ...settings,
            voicePersonality: e.target.value
          })}
        >
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="casual">Casual</option>
        </select>

        <textarea
          placeholder="Custom greeting (leave blank for default)"
          value={settings.customGreeting}
          onChange={(e) => setSettings({
            ...settings,
            customGreeting: e.target.value
          })}
        />
      </section>

      <section className="knowledge-base">
        <h3>Knowledge Base</h3>
        <p>Add information about your business that the AI should know:</p>

        <KnowledgeBaseEditor
          items={settings.knowledgeBase}
          onChange={(items) => setSettings({
            ...settings,
            knowledgeBase: items
          })}
        />

        <div className="kb-suggestions">
          <h4>Suggested Information to Add:</h4>
          <ul>
            <li>Services offered and pricing</li>
            <li>Common questions and answers</li>
            <li>Special instructions or policies</li>
            <li>Team member names and roles</li>
          </ul>
        </div>
      </section>

      <button onClick={saveSettings} className="save-button">
        Save Settings
      </button>
    </div>
  )
}
```

### Testing Framework for Phase 1

Testing is crucial even in the MVP phase. Here's our comprehensive testing approach:

```javascript
// tests/voice-pipeline.test.js
describe('Voice Pipeline Tests', () => {
  let voiceProcessor
  let mockCall

  beforeEach(() => {
    mockCall = {
      organization_id: 'test-org-123',
      call_id: 'test-call-456',
      caller_phone: '+1234567890'
    }

    voiceProcessor = new VoiceProcessor(
      mockCall.organization_id,
      mockCall.call_id
    )
  })

  test('Should transcribe audio accurately', async () => {
    """
    Test that our STT pipeline works correctly.
    We use pre-recorded audio samples for consistency.
    """

    const audioSample = loadAudioFile('samples/schedule_appointment.wav')
    const transcript = await voiceProcessor.transcribe(audioSample)

    expect(transcript.toLowerCase()).toContain('appointment')
    expect(transcript.confidence).toBeGreaterThan(0.9)
  })

  test('Should detect scheduling intent', async () => {
    const testPhrases = [
      "I'd like to schedule an appointment",
      "Can I book a time next Tuesday?",
      "Do you have any openings this week?",
      "I need to see someone about my issue"
    ]

    for (const phrase of testPhrases) {
      const intent = await voiceProcessor._detect_intent(phrase)
      expect(intent.type).toBe('scheduling')
    }
  })

  test('Should handle conversation interruptions', async () => {
    """
    Test that the system properly handles when a caller
    interrupts the AI mid-response.
    """

    // Start AI speaking
    const responsePromise = voiceProcessor.speak("This is a long response that will be interrupted")

    // Simulate interruption after 500ms
    setTimeout(() => {
      voiceProcessor.handleInterruption()
    }, 500)

    const result = await responsePromise
    expect(result.interrupted).toBe(true)
    expect(result.duration).toBeLessThan(1000) // Should stop quickly
  })

  test('Should prevent double booking', async () => {
    // Create an existing appointment
    await createTestAppointment({
      scheduled_start: '2024-03-15 14:00:00',
      scheduled_end: '2024-03-15 15:00:00'
    })

    // Try to book overlapping appointment
    const result = await voiceProcessor.bookAppointment({
      requested_time: '2024-03-15 14:30:00',
      duration: 60
    })

    expect(result.success).toBe(false)
    expect(result.reason).toBe('time_conflict')
    expect(result.alternatives).toHaveLength(3) // Should suggest alternatives
  })
})

// tests/integration.test.js
describe('End-to-End Integration Tests', () => {
  test('Complete call flow from ring to appointment', async () => {
    """
    This test simulates an entire call from start to finish,
    ensuring all components work together correctly.
    """

    // 1. Simulate incoming call
    const twilioWebhook = await simulateTwilioCall({
      From: '+1234567890',
      To: '+0987654321',
      CallSid: 'CA123456789'
    })

    expect(twilioWebhook.status).toBe(200)
    expect(twilioWebhook.body).toContain('<Stream')

    // 2. Verify call record created
    const { data: call } = await supabase
      .from('calls')
      .select('*')
      .eq('call_sid', 'CA123456789')
      .single()

    expect(call).toBeDefined()
    expect(call.status).toBe('in_progress')

    // 3. Simulate conversation for scheduling
    const conversation = new ConversationSimulator(call.id)

    await conversation.userSays("Hi, I'd like to schedule an appointment")
    const response1 = await conversation.getAIResponse()
    expect(response1).toContain('happy to help')

    await conversation.userSays("How about tomorrow at 2pm?")
    const response2 = await conversation.getAIResponse()
    expect(response2).toContain('confirmed')

    // 4. Verify appointment created
    const { data: appointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('call_id', call.id)
      .single()

    expect(appointment).toBeDefined()
    expect(appointment.status).toBe('confirmed')

    // 5. Verify Google Calendar event created
    const calendarEvent = await getGoogleCalendarEvent(
      appointment.google_event_id
    )
    expect(calendarEvent).toBeDefined()

    // 6. End call and verify summary
    await conversation.endCall()

    const { data: completedCall } = await supabase
      .from('calls')
      .select('*')
      .eq('id', call.id)
      .single()

    expect(completedCall.status).toBe('completed')
    expect(completedCall.ai_summary).toContain('appointment scheduled')
  })
})
```

### Performance Optimization for Phase 1

Even in the MVP, we need to ensure good performance. Here are the key optimizations:

```typescript
// optimizations/cache-strategy.ts
export class CacheManager {
  """
  Intelligent caching to reduce latency and API costs.
  We cache frequently accessed data in Redis via Supabase.
  """

  private redis: Redis
  private cacheConfig = {
    organizationData: 3600,     // 1 hour
    calendarAvailability: 300,  // 5 minutes
    aiResponses: 86400,         // 24 hours for common questions
    embeddings: 604800          // 1 week
  }

  async getCachedOrFetch<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.redis.get(key)

    if (cached) {
      console.log(`Cache hit for ${key}`)
      return JSON.parse(cached)
    }

    // Fetch fresh data
    console.log(`Cache miss for ${key}, fetching...`)
    const data = await fetchFunction()

    // Store in cache with TTL
    await this.redis.setex(
      key,
      ttl || 3600,
      JSON.stringify(data)
    )

    return data
  }

  async warmupCache(organizationId: string): Promise<void> {
    """
    Pre-load frequently accessed data when system starts.
    This reduces latency for the first call of the day.
    """

    // Load organization settings
    await this.getCachedOrFetch(
      `org:${organizationId}`,
      () => supabase.from('organizations').select('*').eq('id', organizationId).single(),
      this.cacheConfig.organizationData
    )

    // Load and cache knowledge base with embeddings
    const knowledge = await supabase
      .from('knowledge_base')
      .select('*')
      .eq('organization_id', organizationId)

    for (const item of knowledge.data || []) {
      await this.redis.setex(
        `embedding:${item.id}`,
        this.cacheConfig.embeddings,
        JSON.stringify(item.embedding)
      )
    }

    // Pre-generate common responses
    const commonQuestions = [
      "What are your hours?",
      "How much do you charge?",
      "Where are you located?"
    ]

    for (const question of commonQuestions) {
      const response = await generateAIResponse(question, organizationId)
      await this.redis.setex(
        `response:${organizationId}:${hash(question)}`,
        this.cacheConfig.aiResponses,
        response
      )
    }
  }
}

// optimizations/connection-pooling.ts
export class ConnectionPool {
  """
  Manage connections efficiently to prevent exhaustion.
  This is critical when handling many concurrent calls.
  """

  private pools = {
    supabase: new Pool({ max: 20, min: 5 }),
    livekit: new Pool({ max: 50, min: 10 }),
    deepgram: new Pool({ max: 30, min: 5 })
  }

  async executeWithConnection<T>(
    service: string,
    operation: (connection: any) => Promise<T>
  ): Promise<T> {
    const connection = await this.pools[service].acquire()

    try {
      return await operation(connection)
    } finally {
      // Always release connection back to pool
      await this.pools[service].release(connection)
    }
  }
}
```

### Deployment Configuration

Here's how to deploy Phase 1 using Docker and Kubernetes, with Supabase as the backend:

```yaml
# docker-compose.yml for local development
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
    depends_on:
      - redis

  redis:
    image: redis:alpine
    ports:
      - '6379:6379'

  ngrok:
    image: ngrok/ngrok:latest
    command: http app:3000
    environment:
      - NGROK_AUTHTOKEN=${NGROK_AUTHTOKEN}
    ports:
      - '4040:4040' # Ngrok web interface
```

```yaml
# kubernetes/deployment.yaml for production
apiVersion: apps/v1
kind: Deployment
metadata:
  name: voice-platform
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: voice-platform
  template:
    metadata:
      labels:
        app: voice-platform
    spec:
      containers:
        - name: app
          image: your-registry/voice-platform:v1.0
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
            - name: SUPABASE_URL
              valueFrom:
                secretKeyRef:
                  name: voice-platform-secrets
                  key: supabase-url
          resources:
            requests:
              memory: '1Gi'
              cpu: '500m'
            limits:
              memory: '2Gi'
              cpu: '1000m'
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: voice-platform-service
spec:
  selector:
    app: voice-platform
  ports:
    - port: 80
      targetPort: 3000
  type: LoadBalancer
```

### Success Criteria and Metrics for Phase 1

To ensure Phase 1 is successful, we need clear, measurable goals:

```javascript
// monitoring/phase1-metrics.js
export const Phase1Metrics = {
  technical: {
    // Performance metrics
    callAnswerTime: {
      target: '< 6 seconds',
      current: () => getAverageMetric('call_answer_time'),
      critical: true,
    },

    voiceLatency: {
      target: '< 500ms P95',
      current: () => getPercentileMetric('voice_latency', 95),
      critical: true,
    },

    callCompletionRate: {
      target: '> 80%',
      current: () => getCallCompletionRate(),
      critical: true,
    },

    schedulingAccuracy: {
      target: '> 60%',
      current: () => getSchedulingSuccessRate(),
      critical: false,
    },

    systemUptime: {
      target: '> 99%',
      current: () => getSystemUptime(),
      critical: true,
    },
  },

  business: {
    betaCustomers: {
      target: 10,
      current: () => getActiveCustomerCount(),
      critical: true,
    },

    customerSatisfaction: {
      target: '> 7/10',
      current: () => getAverageCSAT(),
      critical: false,
    },

    callsHandled: {
      target: '> 1000 total',
      current: () => getTotalCallsHandled(),
      critical: false,
    },

    appointmentsBooked: {
      target: '> 100 total',
      current: () => getTotalAppointmentsBooked(),
      critical: false,
    },
  },
};

// Dashboard to track these metrics
export function MetricsDashboard() {
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    const interval = setInterval(async () => {
      const currentMetrics = {};

      for (const category in Phase1Metrics) {
        currentMetrics[category] = {};
        for (const metric in Phase1Metrics[category]) {
          const config = Phase1Metrics[category][metric];
          currentMetrics[category][metric] = {
            target: config.target,
            current: await config.current(),
            status: evaluateMetricStatus(config),
          };
        }
      }

      setMetrics(currentMetrics);
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="metrics-dashboard">
      <h2>Phase 1 Success Metrics</h2>
      {/* Render metrics with visual indicators */}
    </div>
  );
}
```

### Phase 1 Deliverables Checklist

Here's what needs to be completed by the end of Phase 1:

```markdown
## Core Infrastructure ✅

- [ ] Supabase project configured with all tables
- [ ] Row-level security policies implemented
- [ ] Edge Functions deployed for webhooks
- [ ] Real-time subscriptions working

## Voice Processing ✅

- [ ] LiveKit integration complete
- [ ] Twilio phone numbers provisioned
- [ ] STT pipeline with Deepgram
- [ ] TTS using OpenAI
- [ ] Basic conversation flow working
- [ ] Latency under 500ms

## Scheduling ✅

- [ ] Google Calendar OAuth flow
- [ ] Two-way calendar sync
- [ ] Conflict detection working
- [ ] Appointment booking flow
- [ ] SMS confirmations sending

## Dashboard ✅

- [ ] Basic admin interface
- [ ] Real-time call monitoring
- [ ] Appointment management
- [ ] Settings configuration
- [ ] Knowledge base editor

## Testing & Quality ✅

- [ ] Unit tests > 70% coverage
- [ ] Integration tests passing
- [ ] Load testing completed (100 concurrent calls)
- [ ] Security audit performed

## Beta Launch ✅

- [ ] 10 beta customers onboarded
- [ ] Documentation complete
- [ ] Support process defined
- [ ] Feedback collection system
- [ ] Monitoring and alerting active
```

### Migration to Phase 2

As Phase 1 concludes, here's how to prepare for Phase 2's advanced features:

```javascript
// preparation/phase2-readiness.js
export async function assessPhase2Readiness() {
  """
  Evaluate if we're ready to move to Phase 2.
  This helps ensure we have a solid foundation.
  """

  const readinessChecks = {
    // Technical stability
    systemStability: {
      check: async () => {
        const uptime = await getSystemUptime()
        return uptime > 0.99 // 99% uptime
      },
      required: true
    },

    // Customer validation
    customerSatisfaction: {
      check: async () => {
        const csat = await getAverageCSAT()
        return csat > 7.0
      },
      required: true
    },

    // Data quality for ML
    callDataVolume: {
      check: async () => {
        const callCount = await getTotalCallsHandled()
        return callCount > 1000 // Enough data for training
      },
      required: false
    },

    // Team readiness
    documentationComplete: {
      check: () => checkDocumentationCompleteness(),
      required: true
    },

    // Financial viability
    unitEconomicsPositive: {
      check: async () => {
        const revenue = await getMonthlyRevenue()
        const costs = await getMonthlyCosts()
        return revenue > costs * 1.5 // 50% margin
      },
      required: false
    }
  }

  const results = {}
  for (const check in readinessChecks) {
    results[check] = await readinessChecks[check].check()
  }

  const required = Object.keys(readinessChecks)
    .filter(k => readinessChecks[k].required)
    .every(k => results[k])

  return {
    ready: required,
    results,
    recommendations: generatePhase2Recommendations(results)
  }
}
```

## Conclusion

Phase 1 establishes a solid foundation with core voice processing and basic scheduling capabilities. By leveraging Supabase as the primary backend, we minimize complexity while maintaining the flexibility to scale. The focus on real-world testing with beta customers ensures we validate product-market fit before expanding features in Phase 2.

The key to success in Phase 1 is maintaining simplicity while ensuring reliability. Every component has been designed to work seamlessly together, with comprehensive testing and monitoring to catch issues early. With this foundation in place, you'll be ready to add advanced AI capabilities and scale to thousands of customers in subsequent phases.
