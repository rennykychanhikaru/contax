'use client';

import { useState } from 'react';
import { Copy, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui/button';

interface WebhookGeneratorProps {
  userId: string;
}

export default function WebhookGenerator({ userId }: WebhookGeneratorProps) {
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateWebhookUrl = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/settings/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate webhook URL');
      }

      const data = await response.json();
      setWebhookUrl(data.webhookUrl);
    } catch (error) {
      console.error('Error generating webhook URL:', error);
      alert('Failed to generate webhook URL. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="space-y-4">
      {!webhookUrl ? (
        <Button
          onClick={generateWebhookUrl}
          disabled={isGenerating}
          variant="outline"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4" />
              Generate Webhook URL
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={webhookUrl}
              readOnly
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono"
            />
            <Button
              onClick={copyToClipboard}
              variant="ghost"
              size="icon"
              title="Copy to clipboard"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {copied && (
            <p className="text-sm text-green-500">Copied to clipboard!</p>
          )}
          <Button
            onClick={generateWebhookUrl}
            variant="ghost"
            size="sm"
            className="text-blue-400 hover:text-blue-300"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Regenerate URL
          </Button>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Use this webhook URL to receive notifications from external services when appointments are booked or calendar events are updated.
        </p>
        {webhookUrl && webhookUrl.includes('localhost') && (
          <div className="p-2 bg-yellow-900/20 border border-yellow-800 rounded text-xs text-yellow-400">
            <p className="font-semibold mb-1">Local Development Mode</p>
            <p>This webhook URL uses localhost and won't be accessible from external services. To test webhooks locally, use a tunneling service like:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>ngrok: <code className="text-yellow-300">ngrok http 3000</code></li>
              <li>Cloudflare Tunnel: <code className="text-yellow-300">cloudflared tunnel --url http://localhost:3000</code></li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}