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
