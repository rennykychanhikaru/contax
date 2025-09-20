### **Product Requirements Document: Call Transcript Extraction and Webhook Integration**

**1. Overview**

This document outlines the requirements for a new feature that will automatically extract structured data from call transcripts and push that data to a user-configured webhook. This will enable our users to integrate their call data with third-party systems like CRMs, analytics tools, and other internal systems.

**2. Problem Statement**

Our users are having valuable conversations with their customers through our platform, but the insights from these conversations are locked away in call transcripts. To make use of this data, users have to manually listen to or read through the transcripts, identify key pieces of information, and then manually enter that data into other systems. This process is time-consuming, error-prone, and prevents them from getting the full value of our platform.

**3. Goals and Objectives**

*   **Goal:** To unlock the data in call transcripts and make it actionable for our users.
*   **Objective 1:** To automatically extract structured data from call transcripts based on user-defined criteria.
*   **Objective 2:** To push the extracted data to a user-configured webhook in near real-time with reliable delivery (signing, retries, idempotency, and observability).
*   **Objective 3:** To provide a simple and intuitive interface for users to configure the data extraction and webhook integration.

**4. User Personas**

*   **Sales Manager:** Wants to automatically update their CRM with new leads and customer information from calls.
*   **Support Manager:** Wants to track customer issues and feedback from calls in their helpdesk software.
*   **Product Manager:** Wants to gather product feedback and feature requests from calls and send them to their product management tool.

**5. Milestones**

**Milestone 1: Backend Foundation (Data Storage and Transcript Fetching)**

*   **Description:** Create the necessary database tables and implement the logic to fetch call transcripts from Twilio.
*   **Tasks:**
    1.  Create a new migration file to add the `call_extractions` table and the `extraction_config` column to the `agent_configurations` table.
    2.  Implement the `getTranscript` method in the `TwilioTelephonyAdapter` class to fetch transcripts from Twilio.
    3.  Create `webhook_endpoints` and `webhook_deliveries` tables to configure endpoints and track deliveries.
*   **Acceptance Criteria:**
    *   The new database tables are created and correctly structured, including indices and updated_at triggers.
    *   The `getTranscript` method can successfully fetch a transcript from Twilio given a valid `callSid`.
    *   Webhook endpoint configuration can be stored and retrieved per agent.

**Milestone 2: Core Extraction and Processing Logic**

*   **Description:** Implement the core logic for extracting data from transcripts and the API endpoint to orchestrate the process.
*   **Tasks:**
    1.  Create a dynamic extraction service that uses an LLM to extract data based on a user-defined configuration, with JSON schema validation.
    2.  Implement background jobs (via QStash) to extract data off the request path.
    3.  Create the post-call job handler that fetches the transcript, gets the extraction configuration, calls the extraction service, and saves the data.
    4.  Implement the Twilio call-status webhook that verifies signatures and enqueues post-call processing.
*   **Acceptance Criteria:**
    *   The extraction service can successfully extract data from a transcript based on a given configuration and passes schema validation.
    *   Post-call processing is executed via a background job; the webhook route responds immediately after enqueueing.
    *   Twilio webhook requests are verified (signature, timestamp) and rejected if invalid.
    *   Extraction results are persisted once per call (`call_sid`) with idempotency guarantees.

**Milestone 3: UI for Configuration**

*   **Description:** Build the user interface for configuring the data extraction and webhook integration.
*   **Tasks:**
    1.  Create the `ExtractionSettingsForm.tsx` component that allows users to dynamically define the fields they want to extract.
    2.  Add webhook configuration in the same UI: endpoint URL, secret (for signing), optional headers, timeout, retry policy, and a "Send test" action.
    3.  Integrate the `ExtractionSettingsForm` into the agent settings page.
    4.  Create the API route to save the extraction configuration and webhook settings.
*   **Acceptance Criteria:**
    *   Users can add, edit, and remove extraction fields in the UI.
    *   Users can configure a webhook URL, secret, and headers; test delivery succeeds against a mock server.
    *   The extraction configuration and webhook settings are successfully saved to the database.

**Milestone 4: Webhook Delivery (Signing, Retries, Idempotency)**

*   **Description:** Deliver extracted data to user-configured webhooks reliably via a delivery worker with signing, retries, idempotency, and tracking.
*   **Tasks:**
    1.  Define a webhook payload schema and headers including a signature and timestamp.
    2.  Implement a delivery worker that sends signed requests, handles response codes, and updates delivery status.
    3.  Implement retry policy with exponential backoff (e.g., 0m, 1m, 5m, 15m, 60m; max attempts configurable per endpoint).
    4.  Ensure idempotent deliveries using an `idempotency_key` (e.g., `call_log_id`).
    5.  Persist delivery attempts, responses, and errors; provide an admin/dev view.
*   **Acceptance Criteria:**
    *   Deliveries are signed and include a timestamp; recipients can verify integrity.
    *   Successful deliveries mark `webhook_deliveries.status = delivered`; failures retry until `max_attempts` then `dead_letter`.
    *   Duplicate webhook triggers for the same call do not cause duplicate deliveries.

**6. Pseudocode**

**Milestone 1: Backend Foundation**

```sql
-- supabase/migrations/YYYYMMDD_add_extraction_tables.sql

-- Add extraction_config to agent_configurations
ALTER TABLE public.agent_configurations
ADD COLUMN IF NOT EXISTS extraction_config JSONB,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create call_extractions table
CREATE TABLE IF NOT EXISTS public.call_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | succeeded | failed
  data JSONB,
  error_code TEXT,
  error_message TEXT,
  extracted_at TIMESTAMPTZ,
  config_version TEXT,
  model TEXT,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_call_extractions_call_log UNIQUE (call_log_id)
);

-- Webhook endpoints (per agent configuration)
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_configuration_id UUID NOT NULL REFERENCES public.agent_configurations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  headers JSONB DEFAULT '{}'::jsonb,
  timeout_ms INT DEFAULT 10000,
  max_attempts INT DEFAULT 5,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook deliveries (one per extraction, may have multiple attempts)
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_extraction_id UUID NOT NULL REFERENCES public.call_extractions(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | delivering | delivered | failed | dead_letter
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  response_code INT,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_deliveries_idempotency UNIQUE (idempotency_key)
);

-- Optional: update updated_at automatically
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_call_extractions'
  ) THEN
    CREATE TRIGGER set_updated_at_call_extractions
    BEFORE UPDATE ON public.call_extractions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_webhook_endpoints'
  ) THEN
    CREATE TRIGGER set_updated_at_webhook_endpoints
    BEFORE UPDATE ON public.webhook_endpoints
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_webhook_deliveries'
  ) THEN
    CREATE TRIGGER set_updated_at_webhook_deliveries
    BEFORE UPDATE ON public.webhook_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
```

```typescript
// lib/telephony/twilio.ts

export class TwilioTelephonyAdapter {
  // ... existing code ...

  async getTranscript(callSid: string): Promise<string> {
    if (!this.client) {
      throw new Error('''Twilio client not configured''');
    }

    // Fetch the recordings for the call
    const recordings = await this.client.recordings.list({ callSid: callSid, limit: 1 });
    if (recordings.length === 0) {
      throw new Error('''No recordings found for this call.''');
    }

    // Fetch the transcription for the recording
    const transcriptions = await this.client.transcriptions.list({ recordingSid: recordings[0].sid, limit: 1 });
    if (transcriptions.length === 0) {
        // if no transcription, create one
        const transcription = await this.client.transcriptions.create({recordingSid: recordings[0].sid});
        // wait for transcription to complete
        let status = transcription.status;
        while (status !== '''completed''') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const t = await this.client.transcriptions(transcription.sid).fetch();
            status = t.status;
        }
    }

    const transcription = await this.client.transcriptions(transcriptions[0].sid).fetch();
    return transcription.transcriptionText;
  }
}
```

**Milestone 2: Core Extraction and Processing Logic**

```typescript
// lib/extraction/openai.ts

import OpenAI from '''openai''';
import { z } from '''zod''';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ExtractionField {
  name: string;
  description: string;
}

interface ExtractionConfig {
  fields: ExtractionField[];
}

export async function extractData(transcript: string, config: ExtractionConfig): Promise<any> {
  const schema = z.object(
    Object.fromEntries(config.fields.map((f) => [f.name, z.any().optional()]))
  );

  const prompt = `
    Given the following transcript, please extract the following information:
    ${config.fields.map(field => `- ${field.name}: ${field.description}`).join('''
''')}

    Transcript:
    ${transcript}

    Please return the data as a JSON object with the following keys:
    ${config.fields.map(field => `- ${field.name}`).join('''
''')}
  `;

  const response = await openai.chat.completions.create({
    model: '''gpt-4-turbo-preview''',
    messages: [{ role: '''user''', content: prompt }],
    response_format: { type: '''json_object''' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return schema.parse(parsed);
}
```

```typescript
// app/api/jobs/extract/route.ts  (QStash job handler)

import { NextRequest, NextResponse } from '''next/server''';
import { TwilioTelephonyAdapter } from '''@/lib/telephony/twilio''';
import { extractData } from '''@/lib/extraction/openai''';
import { createClient } from '''@supabase/supabase-js''';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const { call_sid, agent_id } = await req.json();

  // Idempotency: check if extraction exists
  const { data: callLog } = await supabase
    .from('''call_logs''')
    .select('''id''')
    .eq('''call_sid''', call_sid)
    .single();

  const { data: existing } = await supabase
    .from('''call_extractions''')
    .select('''id, status''')
    .eq('''call_log_id''', callLog.id)
    .maybeSingle();

  if (existing && existing.status === 'succeeded') {
    return NextResponse.json({ success: true, skipped: true });
  }

  await supabase
    .from('''call_extractions''')
    .upsert({ call_log_id: callLog.id, status: 'processing' }, { onConflict: 'call_log_id' });

  // Fetch Twilio credentials and transcript
  const { data: twilioSettings } = await supabase.from('''twilio_settings''').select('''*''').single();
  const twilioAdapter = new TwilioTelephonyAdapter(twilioSettings);
  const transcript = await twilioAdapter.getTranscript(call_sid);

  // Get extraction config
  const { data: agentConfig } = await supabase
    .from('''agent_configurations''')
    .select('''extraction_config''')
    .eq('''id''', agent_id)
    .single();

  // Extract
  try {
    const extractedData = await extractData(transcript, agentConfig.extraction_config);
    await supabase
      .from('''call_extractions''')
      .update({ status: 'succeeded', data: extractedData, extracted_at: new Date().toISOString() })
      .eq('''call_log_id''', callLog.id);

    // Create webhook delivery record and enqueue delivery
    const idempotencyKey = callLog.id;
    const { data: extractionRow } = await supabase
      .from('''call_extractions''')
      .select('''id''')
      .eq('''call_log_id''', callLog.id)
      .single();

    await supabase.from('''webhook_deliveries''').upsert({
      call_extraction_id: extractionRow.id,
      idempotency_key: idempotencyKey,
      status: 'pending',
    }, { onConflict: 'idempotency_key' });

    // Enqueue delivery job (via QStash)
    await fetch(process.env.NEXT_PUBLIC_QSTASH_URL + '/enqueue/webhook-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_extraction_id: extractionRow.id }),
    });
  } catch (e: any) {
    await supabase
      .from('''call_extractions''')
      .update({ status: 'failed', error_message: e.message?.slice(0, 2000) })
      .eq('''call_log_id''', callLog.id);
  }

  return NextResponse.json({ success: true });
}
```

```typescript
// app/api/webhook/call-status/route.ts

import { NextRequest, NextResponse } from '''next/server''';
import { validateTwilioSignature } from '''@/lib/telephony/twilio-verify''';

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_APP_URL + '/api/webhook/call-status';
  const headers = Object.fromEntries(req.headers.entries());
  const body = await req.text();

  // Verify signature from Twilio
  if (!validateTwilioSignature(url, body, headers)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  const payload = Object.fromEntries(new URLSearchParams(body));
  const CallStatus = payload['CallStatus'];
  const CallSid = payload['CallSid'];
  const AgentId = payload['AgentId'];

  if (CallStatus === 'completed' && CallSid && AgentId) {
    // Enqueue extraction job (respond immediately)
    await fetch(process.env.NEXT_PUBLIC_QSTASH_URL + '/enqueue/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_sid: CallSid, agent_id: AgentId }),
    });
  }

  return new NextResponse(null, { status: 200 });
}
```

**Milestone 3: UI for Configuration**

```typescript
// app/agent-settings/ExtractionSettingsForm.tsx

import React, { useState } from '''react''';

export function ExtractionSettingsForm({ agentId, initialConfig, initialWebhook }) {
  const [fields, setFields] = useState(initialConfig.fields || []);
  const [webhook, setWebhook] = useState(initialWebhook || { url: '', secret: '', headers: {} });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAddField = () => {
    setFields([...fields, { name: '''''', description: '''''' }]);
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res1 = await fetch(`/api/agents/${agentId}/extraction`, {
        method: '''POST''',
        headers: { '''Content-Type''': '''application/json''' },
        body: JSON.stringify({ fields }),
      });
      if (!res1.ok) throw new Error('Failed to save extraction config');

      const res2 = await fetch(`/api/agents/${agentId}/webhook`, {
        method: '''POST''',
        headers: { '''Content-Type''': '''application/json''' },
        body: JSON.stringify(webhook),
      });
      if (!res2.ok) throw new Error('Failed to save webhook settings');
      setSuccess('Settings saved');
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/agents/${agentId}/webhook/test`, { method: '''POST''' });
      if (!res.ok) throw new Error('Test delivery failed');
      const body = await res.json().catch(() => ({}));
      setSuccess('Test sent' + (body.message ? `: ${body.message}` : ''));
    } catch (e: any) {
      setError(e.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h3>Extraction Settings</h3>
      {fields.map((field, index) => (
        <div key={index}>
          <input
            type="text"
            placeholder="Field Name"
            value={field.name}
            onChange={(e) => {
              const newFields = [...fields];
              newFields[index].name = e.target.value;
              setFields(newFields);
            }}
          />
          <input
            type="text"
            placeholder="Description"
            value={field.description}
            onChange={(e) => {
              const newFields = [...fields];
              newFields[index].description = e.target.value;
```typescript
// app/api/jobs/webhook-delivery/route.ts (delivery worker)

import { NextRequest, NextResponse } from '''next/server''';
import { createClient } from '''@supabase/supabase-js''';
import crypto from '''crypto''';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function sign(body: string, secret: string, timestamp: string) {
  const payload = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function POST(req: NextRequest) {
  const { call_extraction_id } = await req.json();

  const { data: extraction } = await supabase
    .from('''call_extractions''')
    .select('''id, data, status, call_log_id''')
    .eq('''id''', call_extraction_id)
    .single();

  const { data: callLog } = await supabase
    .from('''call_logs''')
    .select('''call_sid, agent_id, started_at, ended_at''')
    .eq('''id''', extraction.call_log_id)
    .single();

  const { data: endpoint } = await supabase
    .from('''webhook_endpoints''')
    .select('''url, secret, headers, timeout_ms, max_attempts''')
    .eq('''agent_configuration_id''', callLog.agent_id)
    .single();

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    type: 'call.extraction.completed',
    data: {
      call_sid: callLog.call_sid,
      agent_id: callLog.agent_id,
      extracted_data: extraction.data,
      started_at: callLog.started_at,
      ended_at: callLog.ended_at,
    },
    meta: {
      extraction_id: extraction.id,
      idempotency_key: extraction.call_log_id,
      timestamp: new Date().toISOString(),
    },
  };
  const body = JSON.stringify(payload);
  const signature = sign(body, endpoint.secret, timestamp);

  // Update delivery as delivering
  const { data: delivery } = await supabase
    .from('''webhook_deliveries''')
    .update({ status: 'delivering', attempts: 1, last_attempt_at: new Date().toISOString() })
    .eq('''idempotency_key''', extraction.call_log_id)
    .select('''id, attempts''')
    .single();

  const headers = {
    'Content-Type': 'application/json',
    'X-Contax-Signature': signature,
    'X-Contax-Timestamp': timestamp,
    ...(endpoint.headers || {}),
  } as any;

  try {
    const resp = await fetch(endpoint.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(endpoint.timeout_ms || 10000) });
    const text = await resp.text();
    if (resp.ok) {
      await supabase
        .from('''webhook_deliveries''')
        .update({ status: 'delivered', response_code: resp.status, response_body: text })
        .eq('''id''', delivery.id);
    } else {
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
  } catch (e: any) {
    const attempts = (delivery.attempts || 1) + 1;
    const backoffs = [0, 60, 300, 900, 3600];
    const max = endpoint.max_attempts || 5;
    const idx = Math.min(attempts - 1, backoffs.length - 1);
    const next = new Date(Date.now() + backoffs[idx] * 1000).toISOString();
    const status = attempts >= max ? 'dead_letter' : 'failed';
    await supabase
      .from('''webhook_deliveries''')
      .update({ status, attempts, next_attempt_at: next, error_message: (e.message || '').slice(0, 2000) })
      .eq('''id''', delivery.id);
    if (status !== 'dead_letter') {
      await fetch(process.env.NEXT_PUBLIC_QSTASH_URL + '/enqueue/webhook-delivery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ call_extraction_id })
      });
    }
  }

  return NextResponse.json({ success: true });
}
```
              setFields(newFields);
            }}
          />
        </div>
      ))}
      <button disabled={saving || testing} onClick={handleAddField}>Add Field</button>
      <button disabled={saving || testing} onClick={handleSave}>Save</button>

      <h3>Webhook Settings</h3>
      <input
        type="url"
        placeholder="Webhook URL"
        value={webhook.url}
        onChange={(e) => setWebhook({ ...webhook, url: e.target.value })}
      />
      <input
        type="password"
        placeholder="Webhook Secret"
        value={webhook.secret}
        onChange={(e) => setWebhook({ ...webhook, secret: e.target.value })}
      />
      <textarea
        placeholder="Headers (JSON)"
        value={JSON.stringify(webhook.headers || {}, null, 2)}
        onChange={(e) => {
          try { setWebhook({ ...webhook, headers: JSON.parse(e.target.value || '{}') }); } catch {}
        }}
      />
      <button disabled={saving || testing} onClick={handleTest}>Send Test</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </div>
  );
}
```

```typescript
// app/api/agents/[agent_id]/webhook/test/route.ts

import { NextRequest, NextResponse } from '''next/server''';
import { createClient } from '''@supabase/supabase-js''';
import crypto from '''crypto''';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function sign(body: string, secret: string, timestamp: string) {
  const payload = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function POST(_req: NextRequest, { params }: { params: { agent_id: string } }) {
  const agentId = params.agent_id;
  const { data: endpoint } = await supabase
    .from('''webhook_endpoints''')
    .select('''url, secret, headers''')
    .eq('''agent_configuration_id''', agentId)
    .maybeSingle();

  if (!endpoint?.url || !endpoint?.secret) {
    return NextResponse.json({ message: 'Webhook not configured' }, { status: 400 });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    type: 'call.extraction.test',
    data: { example: true },
    meta: { timestamp: new Date().toISOString() },
  };
  const body = JSON.stringify(payload);
  const signature = sign(body, endpoint.secret, timestamp);

  const headers = {
    'Content-Type': 'application/json',
    'X-Contax-Signature': signature,
    'X-Contax-Timestamp': timestamp,
    ...(endpoint.headers || {}),
  } as any;

  try {
    const resp = await fetch(endpoint.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
    const text = await resp.text();
    return NextResponse.json({ status: resp.status, message: text.slice(0, 500) });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Test failed' }, { status: 500 });
  }
}
```

**7. Webhook Payload & Security**

Payload schema (example):

```
POST <endpoint.url>
Headers:
  Content-Type: application/json
  X-Contax-Signature: <hex sha256 hmac of "<timestamp>.<body>">
  X-Contax-Timestamp: <unix seconds>

Body (JSON):
{
  "type": "call.extraction.completed",
  "data": {
    "call_sid": "CA...",
    "agent_id": "...",
    "extracted_data": { ... },
    "started_at": "...",
    "ended_at": "..."
  },
  "meta": {
    "extraction_id": "uuid",
    "idempotency_key": "call_log_id uuid",
    "timestamp": "ISO8601"
  }
}
```

Verification on receiver side:
- Compute `HMAC_SHA256(timestamp + '.' + body, secret)` and compare to `X-Contax-Signature`.
- Reject if timestamp is older than 5 minutes to prevent replay.

Inbound Twilio webhook security:
- Validate Twilio signature and allowed IP ranges where feasible.
- Only process `completed` events; ignore others.

Idempotency:
- Use `idempotency_key = call_log_id` to ensure a single delivery per call.

Retry Policy:
- Exponential backoff schedule: 0s, 60s, 300s, 900s, 3600s; configurable max attempts.

Timeouts:
- Default 10s request timeout; configurable per endpoint.

Dead-letter:
- After `max_attempts`, mark delivery `dead_letter`; expose in admin UI with requeue option.

**8. Observability & Testing**

Logging & Metrics:
- Log with correlation IDs (`call_sid`, `extraction_id`, `delivery_id`).
- Track extraction latency, success rate, webhook delivery success rate, retry counts.

Dashboards:
- Table views for failed extractions and dead-lettered deliveries with requeue buttons.

Testing:
- Unit: extraction prompt builder and Zod validation.
- Integration: webhook signing/verification, Twilio signature verification (mock).
- E2E: simulate call webhook → extraction job → delivery job using mocks for Twilio/OpenAI.

**9. Non-Functional Requirements**

- Privacy: redact or limit PII fields if required; document retention.
- Performance: end-to-end target P95 under 10 minutes from call completion to delivery (depends on Twilio transcription); document SLA.
- Cost: cap LLM tokens per transcript; optionally chunk long transcripts and summarize.
- Multi-tenancy: isolate configs and secrets per agent/tenant; enforce RLS for data tables where applicable.

**10. Acceptance Criteria (Consolidated)**

- Given a completed call, the system enqueues extraction once and processes it idempotently.
- Extraction status transitions to `succeeded` or `failed` with error details persisted.
- Webhook deliveries are signed, retried with backoff until delivered or dead-lettered, and fully tracked in `webhook_deliveries`.
- UI allows configuring extraction fields, webhook endpoint, secret, headers, and sending a test; configurations persist.
- Twilio webhook requests are signature-verified; invalid requests are rejected.
- Unit and integration tests cover extraction validation and webhook signing flows.
- Environment variables are documented in the PRD and added to .env.example.
- UI shows success and error states for save and test actions; buttons are disabled during network activity.
- A test endpoint exists and can send a signed sample payload to the configured webhook, returning response status.

**11. Repo Integration & Nx Alignment**

Packaging and module boundaries:
- packages/extraction
  - src/schema.ts — Zod schemas and TS types for ExtractionConfig and extracted output.
  - src/service.ts — extractData, prompt builder, and helpers.
  - src/index.ts — public exports.
- packages/qstash
  - src/jobs/extract.ts — background handler to fetch transcript, run extraction, persist results, enqueue delivery (idempotent).
  - src/jobs/webhook-delivery.ts — delivery worker with signing, retries, dead-lettering.
  - src/signing.ts — HMAC signing and verification utilities for outbound webhooks.
  - src/index.ts — enqueue helpers and job registration.
- packages/telephony (or extend existing adapter location)
  - src/twilio.ts — TwilioTelephonyAdapter with getTranscript.
  - src/twilio-verify.ts — validateTwilioSignature helper.

App routes (thin shims):
- app/api/webhook/call-status/route.ts — verify Twilio signature, enqueue extract job via @contax/qstash; respond immediately.
- app/api/jobs/extract/route.ts — import and invoke @contax/qstash extract job handler.
- app/api/jobs/webhook-delivery/route.ts — import and invoke @contax/qstash delivery job handler.
- app/agent-settings/ExtractionSettingsForm.tsx — UI; calls `/api/agents/:id/extraction` and `/api/agents/:id/webhook` routes which persist to Supabase.

Import aliases (tsconfig.base.json):
- "@contax/extraction": ["packages/extraction/src/index.ts"],
- "@contax/qstash": ["packages/qstash/src/index.ts"],
- "@contax/telephony": ["packages/telephony/src/index.ts"].

Nx targets:
- Build: `npm run build` builds all packages and app (ensure new packages have project.json with build/test targets).
- Tests: `npm run test` or `npx nx run extraction:test` and `npx nx run qstash:test`.
- Lint/Typecheck: standard monorepo commands apply.

Testing plan (by package):
- packages/extraction
  - Unit: schema validation (Zod), prompt builder determinism, extractData JSON structure validation (LLM mocked).
- packages/qstash
  - Unit: signing/verification utilities, backoff calculation, enqueue helpers.
  - Integration: delivery worker handling HTTP 2xx/5xx/timeouts with retries and dead-letter (HTTP mocked).
  - Integration: extract job idempotency (DB mocked), proper state transitions.
- app routes
  - Integration: Twilio signature verification path and enqueue call (no network).

Acceptance criteria (integration):
- App routes are <= ~30 LoC and delegate to package code; no business logic embedded in routes.
- New packages compile, unit tests pass under Nx, and imports resolve via aliases.
- Background jobs are invoked via packages/qstash; no long-running work in request handlers.
- Monorepo healthcheck passes (build, lint, typecheck, test).

**12. Environment Variables**

Define and document the following environment variables; add them to `.env.example`:
- `NEXT_PUBLIC_APP_URL`: Public base URL of the app (used in webhook signature validation and callbacks).
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL (public, used server-side in route handlers).
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (server-only).
- `OPENAI_API_KEY`: API key for OpenAI extraction.
- `NEXT_PUBLIC_QSTASH_URL`: Base URL for enqueueing jobs (QStash or equivalent job router).
- `TWILIO_ACCOUNT_SID`: Twilio Account SID (for transcript fetching).
- `TWILIO_AUTH_TOKEN`: Twilio Auth Token (used for client and webhook signature validation).
- `WEBHOOK_DEFAULT_TIMEOUT_MS` (optional): Default timeout for webhook requests.
- `WEBHOOK_MAX_ATTEMPTS` (optional): Default retry count for deliveries.

Notes:
- Treat secrets as server-only; never expose in client bundles.
- Consider per-tenant Twilio creds and webhook secrets where applicable.
