'use client';

import { useState, useEffect } from 'react';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Loader2, Save } from 'lucide-react';

interface AgentResponseTypeFormProps {
  userId: string;
}

export default function AgentResponseTypeForm({ userId }: AgentResponseTypeFormProps) {
  const [phoneCallEnabled, setPhoneCallEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Fetch existing agent settings
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/agents/default');
        if (response.ok) {
          const data = await response.json();
          if (data.agent) {
            setPhoneCallEnabled(data.agent.phone_call_enabled !== false);
            setEmailEnabled(data.agent.email_enabled || false);
            setSmsEnabled(data.agent.sms_enabled || false);
          }
        }
      } catch (error) {
        console.error('Error fetching agent settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/agents/default', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phone_call_enabled: phoneCallEnabled,
          email_enabled: emailEnabled,
          sms_enabled: smsEnabled
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Response types saved successfully!' });
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.message || 'Failed to save response types' });
      }
    } catch (error) {
      console.error('Error saving response types:', error);
      setMessage({ type: 'error', text: 'Failed to save response types' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="phone-call-toggle" className="cursor-pointer">
            Phone Call
          </Label>
          <Switch
            id="phone-call-toggle"
            checked={phoneCallEnabled}
            onCheckedChange={setPhoneCallEnabled}
            disabled={isSaving}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="email-toggle" className="cursor-pointer">
            Email
          </Label>
          <Switch
            id="email-toggle"
            checked={emailEnabled}
            onCheckedChange={setEmailEnabled}
            disabled={isSaving}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="sms-toggle" className="cursor-pointer">
            SMS
          </Label>
          <Switch
            id="sms-toggle"
            checked={smsEnabled}
            onCheckedChange={setSmsEnabled}
            disabled={isSaving}
          />
        </div>
      </div>

      {message && (
        <Alert className={message.type === 'success' ? 'border-green-600' : 'border-red-600'}>
          <AlertDescription className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleSave}
        disabled={isSaving}
        className="flex items-center gap-2"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Response Types
          </>
        )}
      </Button>
    </div>
  );
}