#!/bin/bash

echo "Fixing remaining lint errors..."

# Fix OutgoingCallTrigger
cat > components/OutgoingCallTrigger.fix.tsx << 'EOF'
'use client';

import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Phone } from 'lucide-react';

interface OutgoingCallTriggerProps {
  phoneNumber?: string;
}

export default function OutgoingCallTrigger({ phoneNumber }: OutgoingCallTriggerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTriggerCall = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const targetNumber = phoneNumber || prompt('Enter phone number to call:');
    if (!targetNumber) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/webhook/trigger-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: targetNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger call');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error triggering call:', error);
      setError(error instanceof Error ? error.message : 'Failed to trigger call');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleTriggerCall}
        disabled={isLoading}
        className="w-full"
      >
        <Phone className="mr-2 h-4 w-4" />
        {isLoading ? 'Calling...' : 'Trigger Outgoing Call'}
      </Button>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-600">Call initiated successfully!</p>
      )}
    </div>
  );
}
EOF
mv components/OutgoingCallTrigger.fix.tsx components/OutgoingCallTrigger.tsx

# Fix VoiceAgentStyled to remove unused vars
cat > /tmp/fix-voice-styled.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('components/VoiceAgentStyled.tsx', 'utf8');

// Find the OrgSettings destructuring and remove OrgBar and calendarId
content = content.replace(/const\s*{[^}]*}\s*=\s*OrgSettings\(\);/g, (match) => {
  // Extract the variables
  const vars = match.match(/{([^}]*)}/)[1];
  // Remove OrgBar and calendarId
  const newVars = vars.split(',')
    .map(v => v.trim())
    .filter(v => !v.includes('OrgBar') && !v.includes('calendarId'))
    .join(', ');
  return `const { ${newVars} } = OrgSettings();`;
});

fs.writeFileSync('components/VoiceAgentStyled.tsx', content);
EOF
node /tmp/fix-voice-styled.js

# Fix lib/services unused imports
sed -i '' '/refreshAgentToken/d' lib/services/calendar-service.ts
sed -i '' '/GoogleFreeBusyRequest/d' lib/services/google.ts
sed -i '' '/AgentCalendarIntegration/d' lib/services/token-service.ts

# Fix openai-realtime.ts unused params
cat > /tmp/fix-openai.js << 'EOF'
const fs = require('fs');
let content = fs.readFileSync('lib/agent/openai-realtime.ts', 'utf8');

// Fix connect function
content = content.replace(/connect\(\{ opts \}\)/g, 'connect()');
content = content.replace(/connect\(opts\)/g, 'connect()');

// Fix timezone parameter
content = content.replace(/formatTime\([^,]+, tz: string\)/g, 'formatTime(time: Date)');
content = content.replace(/formatTime\(time, tz\)/g, 'formatTime(time)');

fs.writeFileSync('lib/agent/openai-realtime.ts', content);
EOF
node /tmp/fix-openai.js

echo "Fixed remaining issues!"