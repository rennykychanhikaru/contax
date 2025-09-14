'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';


export default function TwilioIntegrationForm() {
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState('');
  const [showAuthToken, setShowAuthToken] = useState(false);

  // const supabase = createBrowserClient(
  //   process.env.NEXT_PUBLIC_SUPABASE_URL!,
  //   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  // );

  useEffect(() => {
    // Load existing Twilio configuration
    loadTwilioConfig();
  }, []);

  const loadTwilioConfig = async () => {
    try {
      const response = await fetch('/api/settings/twilio');
      if (response.ok) {
        const data = await response.json();
        if (data.accountSid) setAccountSid(data.accountSid);
        if (data.phoneNumber) setPhoneNumber(data.phoneNumber);
        if (data.authToken) setAuthToken(data.authToken);
      }
    } catch (err) {
      console.error('Failed to load Twilio config:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setIsSaved(false);

    try {
      const response = await fetch('/api/settings/twilio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountSid,
          authToken,
          phoneNumber,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save Twilio configuration');
      }

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Twilio account?')) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/settings/twilio', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect Twilio');
      }

      setAccountSid('');
      setAuthToken('');
      setPhoneNumber('');
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="accountSid" className="block text-sm font-medium text-gray-300 mb-1">
          Account SID
        </label>
        <input
          type="text"
          id="accountSid"
          value={accountSid}
          onChange={(e) => setAccountSid(e.target.value)}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          Found in your Twilio Console dashboard
        </p>
      </div>

      <div>
        <label htmlFor="authToken" className="block text-sm font-medium text-gray-300 mb-1">
          Auth Token
        </label>
        <div className="relative">
          <input
            type={showAuthToken ? 'text' : 'password'}
            id="authToken"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="********************************"
            className="w-full px-3 py-2 pr-20 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            required
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
        <p className="mt-1 text-xs text-gray-500">
          Keep this secret! Found in your Twilio Console
        </p>
      </div>

      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-300 mb-1">
          Twilio Phone Number
        </label>
        <input
          type="tel"
          id="phoneNumber"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+1234567890"
          className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          Your Twilio phone number (with country code)
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-md">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isSaved && (
        <div className="p-3 bg-green-900/20 border border-green-800 rounded-md">
          <p className="text-sm text-green-400">Twilio configuration saved successfully!</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="outline"
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : 'Save Configuration'}
        </Button>

        {(accountSid || authToken || phoneNumber) && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDisconnect}
            disabled={isLoading}
          >
            Disconnect Twilio
          </Button>
        )}
      </div>
    </form>
  );
}