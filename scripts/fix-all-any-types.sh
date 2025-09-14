#!/bin/bash

echo "Fixing ALL any types and unused variables..."

# Fix components/Header.tsx and shared/Header.tsx
cat > /tmp/fix-headers.js << 'EOF'
const fs = require('fs');

// Define proper type
const headerType = `interface TeamAccount {
  name: string;
  slug: string;
  id: string;
}`;

// Fix Header.tsx
let header = fs.readFileSync('components/Header.tsx', 'utf8');
// Add type definition if not present
if (!header.includes('interface TeamAccount')) {
  header = header.replace('export function Header(', headerType + '\n\nexport function Header(');
}
// Fix the any type
header = header.replace(/(accounts as any)\[0\]/g, '(accounts[0] as TeamAccount)');
fs.writeFileSync('components/Header.tsx', header);

// Fix shared/Header.tsx
let sharedHeader = fs.readFileSync('components/shared/Header.tsx', 'utf8');
if (!sharedHeader.includes('interface TeamAccount')) {
  sharedHeader = sharedHeader.replace('export function Header(', headerType + '\n\nexport function Header(');
}
sharedHeader = sharedHeader.replace(/(accounts as any)\[0\]/g, '(accounts[0] as TeamAccount)');
fs.writeFileSync('components/shared/Header.tsx', sharedHeader);
EOF
node /tmp/fix-headers.js

# Fix components/OutgoingCallTrigger.tsx
sed -i '' 's/} catch (error: any)/} catch (error)/g' components/OutgoingCallTrigger.tsx
sed -i '' 's/error.message/(error as Error).message/g' components/OutgoingCallTrigger.tsx

# Fix components/VoiceAgent.tsx
cat > /tmp/fix-voice-agent.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('components/VoiceAgent.tsx', 'utf8');

// Remove unused import
content = content.replace(/import.*GCalStatus.*\n/g, '');

// Fix any types
content = content.replace(/\(error: any\)/g, '(error: unknown)');
content = content.replace(/\(e: any\)/g, '(e: unknown)');
content = content.replace(/\(data: any\)/g, '(data: { response?: { output?: Array<{ content?: Array<{ text?: string }> }> } })');
content = content.replace(/\(result: any\)/g, '(result: { response?: { output?: Array<{ content?: Array<{ text?: string }> }> } })');

fs.writeFileSync('components/VoiceAgent.tsx', content);
EOF
node /tmp/fix-voice-agent.js

# Fix components/VoiceAgentStyled.tsx
cat > /tmp/fix-voice-agent-styled.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('components/VoiceAgentStyled.tsx', 'utf8');

// Remove unused OrgBar and calendarId
content = content.replace(/const\s*{[^}]*OrgBar[^}]*}\s*=\s*OrgSettings\(\);/, 'const {} = OrgSettings();');
content = content.replace(/,?\s*calendarId\s*(?:,|\})/g, (match) => match.includes('}') ? '}' : ',');

// Fix any types
content = content.replace(/\(error: any\)/g, '(error: unknown)');
content = content.replace(/\(e: any\)/g, '(e: unknown)');
content = content.replace(/\(data: any\)/g, '(data: { response?: { output?: Array<{ content?: Array<{ text?: string }> }> } })');
content = content.replace(/\(result: any\)/g, '(result: { response?: { output?: Array<{ content?: Array<{ text?: string }> }> } })');

fs.writeFileSync('components/VoiceAgentStyled.tsx', content);
EOF
node /tmp/fix-voice-agent-styled.js

# Fix lib/agent-calendar.ts
sed -i '' 's/: any\b/: unknown/g' lib/agent-calendar.ts
sed -i '' 's/(calendar: any)/(calendar: { id: string; summary: string; primary?: boolean })/g' lib/agent-calendar.ts

# Fix lib/agent/openai-realtime.ts
cat > /tmp/fix-openai-realtime.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('lib/agent/openai-realtime.ts', 'utf8');

// Remove unused parameters
content = content.replace(/connect\({ opts }\)/g, 'connect()');
content = content.replace(/, tz: string/g, '');

// Fix any types
content = content.replace(/: any\b/g, ': unknown');
content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');

fs.writeFileSync('lib/agent/openai-realtime.ts', content);
EOF
node /tmp/fix-openai-realtime.js

# Fix lib/google.ts
sed -i '' 's/: any\b/: unknown/g' lib/google.ts
sed -i '' 's/Record<string, any>/g, 'Record<string, unknown>/g' lib/google.ts

# Fix lib/security/webhook.ts
sed -i '' 's/: any\b/: unknown/g' lib/security/webhook.ts

# Fix lib/services files
sed -i '' 's/: any\b/: unknown/g' lib/services/agent-calendar.ts
sed -i '' 's/(calendar: any)/(calendar: { id: string; summary: string; primary?: boolean })/g' lib/services/agent-calendar.ts
sed -i '' '/import.*refreshAgentToken/d' lib/services/calendar-service.ts
sed -i '' '/import.*GoogleFreeBusyRequest/d' lib/services/google.ts
sed -i '' '/import.*AgentCalendarIntegration/d' lib/services/token-service.ts
sed -i '' 's/: any\b/: unknown/g' lib/services/calendar-service.ts

# Fix lib/utils files
sed -i '' 's/: any\b/: unknown/g' lib/utils/api-errors.ts
sed -i '' 's/: any\b/: unknown/g' lib/utils/logger.ts

# Fix next-env.d.ts
echo '/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.' > next-env.d.ts

echo "All any types fixed!"