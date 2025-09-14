#!/bin/bash

echo "Fixing final 32 errors..."

# Fix unused AudioData in VoiceAgent components
sed -i '' '/^interface AudioData {/,/^}/d' components/VoiceAgent.tsx
sed -i '' '/^interface AudioData {/,/^}/d' components/VoiceAgentStyled.tsx

# Remove unused GCalStatus import
sed -i '' '/GCalStatus/d' components/VoiceAgent.tsx

# Fix VoiceAgentStyled OrgBar issue
cat > /tmp/fix-orgbar.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('components/VoiceAgentStyled.tsx', 'utf8');

// Find and fix the OrgBar line
content = content.replace(/const\s*{\s*OrgBar\s*}\s*=\s*OrgSettings\(\);/g, '// OrgSettings removed - not used');
content = content.replace(/const\s*{}\s*=\s*OrgSettings\(\);/g, '// OrgSettings removed - not used');

fs.writeFileSync('components/VoiceAgentStyled.tsx', content);
EOF
node /tmp/fix-orgbar.js

# Fix openai-realtime.ts opts and tz parameters
cat > /tmp/fix-openai-params.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('lib/agent/openai-realtime.ts', 'utf8');

// Fix connect function signature
content = content.replace(/async connect\({ opts }\)/g, 'async connect()');
content = content.replace(/async connect\(opts\)/g, 'async connect()');

// Fix formatTime function signature
content = content.replace(/formatTime\(time: Date, tz: string\)/g, 'formatTime(time: Date)');

fs.writeFileSync('lib/agent/openai-realtime.ts', content);
EOF
node /tmp/fix-openai-params.js

# Fix specific any types in various files
cat > /tmp/fix-specific-any.js << 'EOF'
const fs = require('fs');

// Fix Header.tsx line 39
let header = fs.readFileSync('components/Header.tsx', 'utf8');
header = header.replace(/(accounts\[0\] as any)/g, 'accounts[0] as TeamAccount');
fs.writeFileSync('components/Header.tsx', header);

// Fix shared/Header.tsx
let sharedHeader = fs.readFileSync('components/shared/Header.tsx', 'utf8');
sharedHeader = sharedHeader.replace(/(accounts\[0\] as any)/g, 'accounts[0] as TeamAccount');
fs.writeFileSync('components/shared/Header.tsx', sharedHeader);

// Fix VoiceAgent.tsx specific any types
let voiceAgent = fs.readFileSync('components/VoiceAgent.tsx', 'utf8');
voiceAgent = voiceAgent.replace(/\(data: any\)/g, '(data: unknown)');
voiceAgent = voiceAgent.replace(/\(result: any\)/g, '(result: unknown)');
fs.writeFileSync('components/VoiceAgent.tsx', voiceAgent);

// Fix VoiceAgentStyled.tsx specific any types
let voiceStyled = fs.readFileSync('components/VoiceAgentStyled.tsx', 'utf8');
voiceStyled = voiceStyled.replace(/\(data: any\)/g, '(data: unknown)');
voiceStyled = voiceStyled.replace(/\(result: any\)/g, '(result: unknown)');
fs.writeFileSync('components/VoiceAgentStyled.tsx', voiceStyled);
EOF
node /tmp/fix-specific-any.js

# Ensure all any types are replaced in lib files
find lib -name "*.ts" -exec sed -i '' 's/: any\b/: unknown/g' {} \;

echo "Final 32 errors should be fixed!"