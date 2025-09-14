#!/bin/bash

echo "Final fixes for remaining lint errors..."

# Fix CalendarSettings - remove userId from props
cat > /tmp/fix-calendar-settings.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('app/settings/CalendarSettings.tsx', 'utf8');
content = content.replace('interface CalendarSettingsProps {\n  userId: string;\n}', 'interface CalendarSettingsProps {}');
content = content.replace('export default function CalendarSettings({ userId }: CalendarSettingsProps)', 'export default function CalendarSettings()');
fs.writeFileSync('app/settings/CalendarSettings.tsx', content);
EOF
node /tmp/fix-calendar-settings.js

# Fix TwilioIntegrationForm - remove unused interface
sed -i '' '/interface TwilioIntegrationFormProps {/,/}/d' app/settings/TwilioIntegrationForm.tsx

# Fix AgentResponseTypeForm - remove userId usage
sed -i '' 's/const { id: userId } = session.user/const {} = session.user/g' app/agent-settings/AgentResponseTypeForm.tsx

# Fix AgentSettingsForm - remove userId usage
sed -i '' 's/const { id: userId } = session.user/const {} = session.user/g' app/agent-settings/AgentSettingsForm.tsx

# Fix VoiceAgent - remove unused import
sed -i '' '/import.*GCalStatus/d' components/VoiceAgent.tsx

# Fix VoiceAgentStyled - remove unused variables
cat > /tmp/fix-voice-agent-styled.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('components/VoiceAgentStyled.tsx', 'utf8');
// Remove OrgBar from the destructuring
content = content.replace(/const\s*{\s*[^}]*OrgBar[^}]*}\s*=/, 'const {');
// Remove calendarId from the destructuring
content = content.replace(/,?\s*calendarId(?:\s*,|\s*})/, match => {
  return match.includes('}') ? '}' : ',';
});
fs.writeFileSync('components/VoiceAgentStyled.tsx', content);
EOF
node /tmp/fix-voice-agent-styled.js

# Fix Header and OutgoingCallTrigger any types
cat > /tmp/fix-components-types.js << 'EOF'
const fs = require('fs');

// Fix Header.tsx
let header = fs.readFileSync('components/Header.tsx', 'utf8');
header = header.replace(/(accounts as any)\[0\]/g, 'accounts[0] as { name: string; slug: string; id: string }');
fs.writeFileSync('components/Header.tsx', header);

// Fix shared/Header.tsx
let sharedHeader = fs.readFileSync('components/shared/Header.tsx', 'utf8');
sharedHeader = sharedHeader.replace(/(accounts as any)\[0\]/g, 'accounts[0] as { name: string; slug: string; id: string }');
fs.writeFileSync('components/shared/Header.tsx', sharedHeader);

// Fix OutgoingCallTrigger.tsx
let outgoing = fs.readFileSync('components/OutgoingCallTrigger.tsx', 'utf8');
outgoing = outgoing.replace(/} catch \(error: any\)/, '} catch (error)');
fs.writeFileSync('components/OutgoingCallTrigger.tsx', outgoing);
EOF
node /tmp/fix-components-types.js

# Fix VoiceAgent and VoiceAgentStyled any types
cat > /tmp/fix-voice-agent-types.js << 'EOF'
const fs = require('fs');

function fixAnyTypes(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace specific any types with proper types
  content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');
  content = content.replace(/\(error: any\)/g, '(error: unknown)');
  content = content.replace(/\(e: any\)/g, '(e: unknown)');
  content = content.replace(/: any\[\]/g, ': unknown[]');
  content = content.replace(/\(data: any\)/g, '(data: unknown)');
  content = content.replace(/\(result: any\)/g, '(result: { response?: { output?: Array<{ content?: Array<{ text?: string }> }> } })');

  fs.writeFileSync(file, content);
}

fixAnyTypes('components/VoiceAgent.tsx');
fixAnyTypes('components/VoiceAgentStyled.tsx');
fixAnyTypes('components/shared/VoiceAgent.tsx');
EOF
node /tmp/fix-voice-agent-types.js

# Fix lib directory any types
cat > /tmp/fix-lib-types.js << 'EOF'
const fs = require('fs');

// Fix agent-calendar.ts
let agentCal = fs.readFileSync('lib/agent-calendar.ts', 'utf8');
agentCal = agentCal.replace(/: any\b/g, ': unknown');
agentCal = agentCal.replace(/\(calendar: any, index: any\)/g, '(calendar: { id: string; summary: string; primary?: boolean }, index: number)');
fs.writeFileSync('lib/agent-calendar.ts', agentCal);

// Fix services/agent-calendar.ts
let servicesAgentCal = fs.readFileSync('lib/services/agent-calendar.ts', 'utf8');
servicesAgentCal = servicesAgentCal.replace(/: any\b/g, ': unknown');
servicesAgentCal = servicesAgentCal.replace(/\(calendar: any, index: any\)/g, '(calendar: { id: string; summary: string; primary?: boolean }, index: number)');
fs.writeFileSync('lib/services/agent-calendar.ts', servicesAgentCal);

// Fix openai-realtime.ts
let openai = fs.readFileSync('lib/agent/openai-realtime.ts', 'utf8');
openai = openai.replace(/Record<string, any>/g, 'Record<string, unknown>');
openai = openai.replace(/: any\b/g, ': unknown');
fs.writeFileSync('lib/agent/openai-realtime.ts', openai);
EOF
node /tmp/fix-lib-types.js

echo "Final fixes applied!"