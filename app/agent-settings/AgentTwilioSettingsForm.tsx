'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAgentSettings } from '@/lib/hooks/useAgentSettings';

export default function AgentTwilioSettingsForm({ agentId }: { agentId: string | null }) {
  const {
    twilioAccountSid,
    setTwilioAccountSid,
    twilioAuthToken,
    setTwilioAuthToken,
    twilioPhoneNumber,
    setTwilioPhoneNumber,
    twilioConfigured,
    isLoading,
    message,
    handleSaveTwilio,
  } = useAgentSettings(agentId);

  const [showAuthToken, setShowAuthToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; message: string }>(null);
  const [testPhone, setTestPhone] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [callResult, setCallResult] = useState<null | { ok: boolean; message: string }>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveTwilio();
  };

  const handleTest = async () => {
    if (!agentId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/twilio/test`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        const owned = data.phoneOwned ? ' and phone number is owned by this account' : '';
        setTestResult({ ok: true, message: `Connected to Twilio account ${data.accountSid}${owned}.` });
      } else {
        setTestResult({ ok: false, message: data.error || 'Failed to connect to Twilio' });
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!agentId) return;
    if (!confirm('Disconnect Twilio for this agent?')) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/twilio`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect Twilio');
      setTwilioAccountSid('');
      setTwilioAuthToken('');
      setTwilioPhoneNumber('');
      setMessage({ type: 'success', text: 'Twilio disconnected successfully!' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'An error occurred' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!twilioConfigured && (
        <Alert className="border-yellow-600">
          <AlertDescription className="text-yellow-500 text-sm">
            This agent does not have Twilio configured yet. Outbound calls may fail until you connect a Twilio account and number.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <label htmlFor="accountSid" className="block text-sm font-medium text-gray-300 mb-1">
          Account SID
        </label>
        <input
          type="text"
          id="accountSid"
          value={twilioAccountSid}
          onChange={(e) => setTwilioAccountSid(e.target.value)}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          required
        />
        <p className="mt-1 text-xs text-gray-500">Found in your Twilio Console</p>
      </div>

      <div>
        <label htmlFor="authToken" className="block text-sm font-medium text-gray-300 mb-1">
          Auth Token
        </label>
        <div className="relative">
          <input
            type={showAuthToken ? 'text' : 'password'}
            id="authToken"
            value={twilioAuthToken}
            onChange={(e) => setTwilioAuthToken(e.target.value)}
            placeholder="********************************"
            className="w-full px-3 py-2 pr-20 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            required={!twilioConfigured}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAuthToken(!showAuthToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {showAuthToken ? 'Hide' : 'Show'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Keep this secret. Required when first connecting.</p>
      </div>

      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-300 mb-1">
          Twilio Phone Number
        </label>
        <input
          type="tel"
          id="phoneNumber"
          value={twilioPhoneNumber}
          onChange={(e) => setTwilioPhoneNumber(e.target.value)}
          placeholder="+1234567890"
          className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          required
        />
        <p className="mt-1 text-xs text-gray-500">Must be in E.164 format</p>
      </div>

      {message && (
        <Alert className={message.type === 'success' ? 'border-green-700' : 'border-red-600'}>
          <AlertDescription className={message.type === 'success' ? 'text-green-500 text-sm' : 'text-red-500 text-sm'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {testResult && (
        <Alert className={testResult.ok ? 'border-green-700' : 'border-red-600'}>
          <AlertDescription className={testResult.ok ? 'text-green-500 text-sm' : 'text-red-500 text-sm'}>
            {testResult.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button type="submit" variant="outline" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Configuration'}
        </Button>
        {(twilioAccountSid || twilioPhoneNumber) && (
          <Button type="button" variant="outline" onClick={handleDisconnect} disabled={isLoading}>
            Disconnect Twilio
          </Button>
        )}
        <Button type="button" variant="outline" onClick={handleTest} disabled={isLoading || isTesting}>
          {isTesting ? 'Testing...' : 'Test Connection'}
        </Button>
      </div>

      <div className="mt-6 space-y-2 p-3 border border-gray-800 rounded-md">
        <p className="text-sm text-gray-400">
          Place a quick test call using this agent's Twilio settings. Standard Twilio charges may apply.
        </p>
        <label htmlFor="testPhone" className="block text-sm font-medium text-gray-300 mb-1">Test Call To</label>
        <input
          id="testPhone"
          type="tel"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          placeholder="+15551234567"
          className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isCalling || !agentId || !twilioPhoneNumber}
            onClick={async () => {
              setCallResult(null);
              const raw = testPhone.trim();
              if (!raw || !/^\+\d{7,15}$/.test(raw)) {
                setCallResult({ ok: false, message: 'Enter a valid E.164 phone number (e.g., +15551234567).' });
                return;
              }
              setIsCalling(true);
              try {
                const res = await fetch('/api/webhook/outgoing-call', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ agentId, phoneNumber: raw }),
                });
                const data = await res.json();
                if (!res.ok || data.error) {
                  throw new Error(data.error || 'Failed to create test call');
                }
                const sid = data.callSid || data.twilioCallSid || '(no SID)';
                setCallResult({ ok: true, message: `Test call initiated. Twilio SID: ${sid}` });
              } catch (e) {
                setCallResult({ ok: false, message: e instanceof Error ? e.message : 'Unknown error' });
              } finally {
                setIsCalling(false);
              }
            }}
          >
            {isCalling ? 'Calling...' : 'Place Test Call'}
          </Button>
        </div>
        {callResult && (
          <Alert className={callResult.ok ? 'border-green-700' : 'border-red-600'}>
            <AlertDescription className={callResult.ok ? 'text-green-500 text-sm' : 'text-red-500 text-sm'}>
              {callResult.message}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
}
