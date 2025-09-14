#!/bin/bash

echo "Final fixes for all any types..."

# Fix VoiceAgent.tsx properly
cat > /tmp/fix-voice-agent-final.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('components/VoiceAgent.tsx', 'utf8');

// Define proper types at the top
const types = `
interface AudioData {
  response?: {
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };
}
`;

// Add types if not present
if (!content.includes('interface AudioData')) {
  content = types + '\n' + content;
}

// Replace all any types with proper types
content = content.replace(/\(data: any\)/g, '(data: AudioData)');
content = content.replace(/\(result: any\)/g, '(result: AudioData)');
content = content.replace(/\(error: any\)/g, '(error: unknown)');
content = content.replace(/\(e: any\)/g, '(e: unknown)');
content = content.replace(/: any\b/g, ': unknown');

fs.writeFileSync('components/VoiceAgent.tsx', content);
EOF
node /tmp/fix-voice-agent-final.js

# Fix VoiceAgentStyled.tsx
cat > /tmp/fix-voice-styled-final.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('components/VoiceAgentStyled.tsx', 'utf8');

// Add proper types
const types = `
interface AudioData {
  response?: {
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };
}
`;

if (!content.includes('interface AudioData')) {
  content = types + '\n' + content;
}

// Replace all any types
content = content.replace(/\(data: any\)/g, '(data: AudioData)');
content = content.replace(/\(result: any\)/g, '(result: AudioData)');
content = content.replace(/\(error: any\)/g, '(error: unknown)');
content = content.replace(/\(e: any\)/g, '(e: unknown)');
content = content.replace(/: any\b/g, ': unknown');

fs.writeFileSync('components/VoiceAgentStyled.tsx', content);
EOF
node /tmp/fix-voice-styled-final.js

# Fix lib/agent/openai-realtime.ts
cat > /tmp/fix-openai-final.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('lib/agent/openai-realtime.ts', 'utf8');

// Fix all any types to unknown
content = content.replace(/: any\b/g, ': unknown');
content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');

// Fix specific function signatures
content = content.replace(/sendUserMessageContent\(content: \[.*?\]\)/g,
  'sendUserMessageContent(content: Array<{ type: string; text?: string }>)');

fs.writeFileSync('lib/agent/openai-realtime.ts', content);
EOF
node /tmp/fix-openai-final.js

# Fix lib/google.ts
cat > /tmp/fix-google.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('lib/google.ts', 'utf8');

// Replace all any with unknown
content = content.replace(/: any\b/g, ': unknown');
content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');

fs.writeFileSync('lib/google.ts', content);
EOF
node /tmp/fix-google.js

# Fix lib/security/webhook.ts
sed -i '' 's/: any\b/: unknown/g' lib/security/webhook.ts

# Fix lib/services/agent-calendar.ts
cat > /tmp/fix-agent-cal.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('lib/services/agent-calendar.ts', 'utf8');

// Fix calendar type
content = content.replace(/\(calendar: any, index: any\)/g,
  '(calendar: { id: string; summary: string; primary?: boolean }, index: number)');
content = content.replace(/: any\b/g, ': unknown');

fs.writeFileSync('lib/services/agent-calendar.ts', content);

// Also fix lib/agent-calendar.ts
content = fs.readFileSync('lib/agent-calendar.ts', 'utf8');
content = content.replace(/\(calendar: any, index: any\)/g,
  '(calendar: { id: string; summary: string; primary?: boolean }, index: number)');
content = content.replace(/: any\b/g, ': unknown');
fs.writeFileSync('lib/agent-calendar.ts', content);
EOF
node /tmp/fix-agent-cal.js

# Fix lib/services/calendar-service.ts
sed -i '' 's/: any\b/: unknown/g' lib/services/calendar-service.ts

# Fix lib/utils/api-errors.ts and logger.ts
sed -i '' 's/: any\b/: unknown/g' lib/utils/api-errors.ts
sed -i '' 's/: any\b/: unknown/g' lib/utils/logger.ts

echo "Final any type fixes complete!"