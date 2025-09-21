'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Copy, CheckCircle } from 'lucide-react';

interface WebhookSettingsProps {
  webhookEnabled: boolean;
  setWebhookEnabled: (enabled: boolean) => void;
  webhookUrl: string;
  isSaving: boolean;
  twilioConfigured: boolean;
}

export default function WebhookSettings({ 
  webhookEnabled, 
  setWebhookEnabled, 
  webhookUrl, 
  isSaving,
  twilioConfigured
}: WebhookSettingsProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="webhook-enabled">Webhook Integration</Label>
          <p className="text-sm text-gray-500">
            Enable webhook to trigger calls via external services (Make, Zapier, etc.)
          </p>
        </div>
        <Switch
          id="webhook-enabled"
          checked={webhookEnabled}
          onCheckedChange={setWebhookEnabled}
          disabled={isSaving || !twilioConfigured}
        />
      </div>

      {!twilioConfigured && (
        <div className="p-3 rounded-md border border-yellow-700 bg-yellow-900/20">
          <p className="text-xs text-yellow-500">
            Configure Twilio for this agent before enabling webhooks (see Agent Twilio Integration above).
          </p>
        </div>
      )}

      {webhookEnabled && webhookUrl && (
        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <input
              type="text"
              value={webhookUrl}
              readOnly
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-gray-300 font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-2"
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Send a POST request to this URL with phone number to trigger a call
          </p>
        </div>
      )}
    </div>
  );
}
