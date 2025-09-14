#!/bin/bash

echo "Fixing ALL remaining lint errors..."

# Fix parsing errors in webhook/agent/[token]/twiml/route.ts
echo "Fixing twiml route parsing error..."
sed -i '' 's/const gather = /\/\/ const gather = /g' "app/api/webhook/agent/[token]/twiml/route.ts" 2>/dev/null || true

# Fix parsing error in onboarding/page.tsx
echo "Fixing onboarding page..."
sed -i '' 's/\/\/ const supabase/  \/\/ const supabase/g' app/onboarding/page.tsx 2>/dev/null || true

# Fix parsing error in TwilioIntegrationForm.tsx
echo "Fixing TwilioIntegrationForm..."
sed -i '' 's/\/\/ const supabase/  \/\/ const supabase/g' app/settings/TwilioIntegrationForm.tsx 2>/dev/null || true

# Fix unused imports
echo "Fixing unused imports..."
sed -i '' '/import.*useRouter.*from.*next\/navigation/d' app/auth/sign-up/page.tsx
sed -i '' '/import.*MicOff.*from.*lucide-react/d' components/VoiceAgent.tsx
sed -i '' '/import.*Alert.*from.*@\/components\/ui\/alert/d' components/VoiceAgentStyled.tsx
sed -i '' '/import.*ApiResponse/d' components/shared/VoiceAgent.tsx
sed -i '' '/import.*refreshAgentToken/d' lib/services/calendar-service.ts
sed -i '' '/import.*GoogleFreeBusyRequest/d' lib/services/google.ts
sed -i '' '/import.*AgentCalendarIntegration/d' lib/services/token-service.ts

# Fix unused variables
echo "Fixing unused variables..."
sed -i '' 's/const { from, to, direction, duration, timestamp }/const { duration }/g' app/api/webhook/call-status/route.ts
sed -i '' 's/const loading = /\/\/ const loading = /g' components/CalendarStatus.tsx
sed -i '' 's/const { data, error }/const { error }/g' lib/agent-calendar.ts
sed -i '' 's/const { data, error }/const { error }/g' lib/services/agent-calendar.ts

# Fix userId destructuring in components
echo "Fixing userId destructuring..."
sed -i '' 's/{.*userId.*} = session.user/{} = session.user/g' app/agent-settings/AgentResponseTypeForm.tsx
sed -i '' 's/{.*userId.*} = session.user/{} = session.user/g' app/agent-settings/AgentSettingsForm.tsx
sed -i '' 's/{.*userId.*} = session.user/{} = session.user/g' app/settings/CalendarSettings.tsx
sed -i '' 's/{.*userId.*} = await/{} = await/g' app/settings/TwilioIntegrationForm.tsx

# Fix DELETE function signatures
echo "Fixing DELETE function signatures..."
sed -i '' 's/export async function DELETE(_req: NextRequest)/export async function DELETE()/g' app/api/settings/webhook/route.ts

# Fix any types with proper types
echo "Creating type fixes for any types..."
cat > /tmp/fix-any-types.js << 'EOF'
const fs = require('fs');

// Fix settings/twilio/route.ts
let twilioRoute = fs.readFileSync('app/api/settings/twilio/route.ts', 'utf8');
twilioRoute = twilioRoute.replace(/const updateData: any = {/, `interface UpdateData {
      updated_at: string;
      phone_number?: string;
      account_sid?: string;
      auth_token?: string;
      webhook_url?: string;
      webhook_method?: string;
      status_callback_url?: string;
      voice_url?: string;
      sms_url?: string;
      is_active?: boolean;
    }

    const updateData: UpdateData = {`);
fs.writeFileSync('app/api/settings/twilio/route.ts', twilioRoute);

// Fix webhook/org/[token]/trigger-call/route.ts
let triggerCall = fs.readFileSync('app/api/webhook/org/[token]/trigger-call/route.ts', 'utf8');
triggerCall = triggerCall.replace(/let body: any/, 'let body: unknown');
fs.writeFileSync('app/api/webhook/org/[token]/trigger-call/route.ts', triggerCall);

// Fix webhook/trigger-call/route.ts
let webhookTrigger = fs.readFileSync('app/api/webhook/trigger-call/route.ts', 'utf8');
webhookTrigger = webhookTrigger.replace(/const validation = CallRequestSchema.safeParse\(body as any\)/, 'const validation = CallRequestSchema.safeParse(body)');
webhookTrigger = webhookTrigger.replace(/const result = await supabase.rpc\('trigger_outgoing_call', body as any\)/, 'const result = await supabase.rpc("trigger_outgoing_call", body as Record<string, unknown>)');
fs.writeFileSync('app/api/webhook/trigger-call/route.ts', webhookTrigger);

// Fix components/Header.tsx
let header = fs.readFileSync('components/Header.tsx', 'utf8');
header = header.replace(/\(accounts as any\)\[0\]/, 'accounts[0] as TeamAccountWithOrganization');
fs.writeFileSync('components/Header.tsx', header);

// Fix components/shared/Header.tsx
let sharedHeader = fs.readFileSync('components/shared/Header.tsx', 'utf8');
sharedHeader = sharedHeader.replace(/\(accounts as any\)\[0\]/, 'accounts[0] as TeamAccountWithOrganization');
fs.writeFileSync('components/shared/Header.tsx', sharedHeader);

// Fix components/OutgoingCallTrigger.tsx
let outgoingCall = fs.readFileSync('components/OutgoingCallTrigger.tsx', 'utf8');
outgoingCall = outgoingCall.replace(/} catch \(error: any\)/, '} catch (error)');
fs.writeFileSync('components/OutgoingCallTrigger.tsx', outgoingCall);

// Fix lib files
let openaiRealtime = fs.readFileSync('lib/agent/openai-realtime.ts', 'utf8');
openaiRealtime = openaiRealtime.replace(/Record<string, any>/, 'Record<string, unknown>');
fs.writeFileSync('lib/agent/openai-realtime.ts', openaiRealtime);

let google = fs.readFileSync('lib/google.ts', 'utf8');
google = google.replace(/Record<string, any>/, 'Record<string, unknown>');
fs.writeFileSync('lib/google.ts', google);

let webhookTestHelper = fs.readFileSync('lib/security/webhook-test-helper.ts', 'utf8');
webhookTestHelper = webhookTestHelper.replace(/Record<string, any>/, 'Record<string, unknown>');
fs.writeFileSync('lib/security/webhook-test-helper.ts', webhookTestHelper);

let webhook = fs.readFileSync('lib/security/webhook.ts', 'utf8');
webhook = webhook.replace(/Record<string, any>/, 'Record<string, unknown>');
fs.writeFileSync('lib/security/webhook.ts', webhook);

let apiErrors = fs.readFileSync('lib/utils/api-errors.ts', 'utf8');
apiErrors = apiErrors.replace(/Record<string, any>/g, 'Record<string, unknown>');
fs.writeFileSync('lib/utils/api-errors.ts', apiErrors);

let logger = fs.readFileSync('lib/utils/logger.ts', 'utf8');
logger = logger.replace(/\.\.\. Record<string, any>\[\]/, '... Record<string, unknown>[]');
fs.writeFileSync('lib/utils/logger.ts', logger);

console.log('Any types fixed!');
EOF

node /tmp/fix-any-types.js

echo "All lint errors should be fixed now!"