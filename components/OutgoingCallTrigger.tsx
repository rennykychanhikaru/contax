'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';

interface OutgoingCallTriggerProps {
  organizationId?: string;
  userId?: string;
  agentId?: string;
}

export function OutgoingCallTrigger({ 
  organizationId, 
  userId, 
  agentId 
}: OutgoingCallTriggerProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCall = async () => {
    if (!phoneNumber) {
      setError('Please enter a phone number');
      return;
    }

    // Basic phone number validation
    const cleanedNumber = phoneNumber.replace(/\D/g, '');
    if (cleanedNumber.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/webhook/outgoing-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber.startsWith('+') ? phoneNumber : `+1${cleanedNumber}`,
          organizationId,
          userId,
          agentId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate call');
      }

      setCallSid(data.callSid);
      console.log('Call initiated:', data);
    } catch (err: any) {
      setError(err.message || 'Failed to initiate call');
      console.error('Error initiating call:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHangup = async () => {
    if (!callSid) return;

    setIsLoading(true);
    try {
      // You can implement a hangup endpoint if needed
      console.log('Hanging up call:', callSid);
      setCallSid(null);
      setPhoneNumber('');
    } catch (err) {
      console.error('Error hanging up:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          disabled={isLoading || !!callSid}
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>

      <div className="flex gap-2">
        {!callSid ? (
          <Button
            onClick={handleCall}
            disabled={isLoading || !phoneNumber}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Initiating...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4" />
                Call
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleHangup}
            variant="destructive"
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <PhoneOff className="h-4 w-4" />
            Hang Up
          </Button>
        )}
      </div>

      {callSid && (
        <div className="p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-800">
            Call initiated successfully!
          </p>
          <p className="text-xs text-green-600 mt-1">
            Call SID: {callSid}
          </p>
        </div>
      )}
    </div>
  );
}