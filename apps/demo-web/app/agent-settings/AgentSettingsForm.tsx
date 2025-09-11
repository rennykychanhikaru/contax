'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Loader2, Save, RotateCcw, Copy, CheckCircle, Info } from 'lucide-react';
import { Switch } from '../../components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';

interface AgentSettingsFormProps {
  userId: string;
}

const DEFAULT_PROMPT = `You are a helpful scheduling assistant for Renny's office. 
You can help callers:
- Check calendar availability
- Schedule meetings
- Provide information about available time slots

Be professional, friendly, and efficient in your responses.`;

const DEFAULT_GREETING = `Hi! Thanks for calling. I'm your AI assistant. How can I help you today?`;

const DEFAULT_NAME = 'AI Assistant';

export default function AgentSettingsForm({ userId }: AgentSettingsFormProps) {
  const [displayName, setDisplayName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [greeting, setGreeting] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Fetch existing agent settings
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/agents/default');
        const data = await response.json();
        
        if (response.ok && data.agent) {
          console.log('Loaded agent settings:', data.agent);
          setDisplayName(data.agent.display_name || DEFAULT_NAME);
          setPrompt(data.agent.prompt || DEFAULT_PROMPT);
          setGreeting(data.agent.greeting || DEFAULT_GREETING);
          setWebhookEnabled(data.agent.webhook_enabled || false);
          setWebhookUrl(data.agent.webhook_url || '');
        } else {
          console.error('Failed to load agent settings:', data.error || 'No agent found');
          // If no settings exist, use default
          setDisplayName(DEFAULT_NAME);
          setPrompt(DEFAULT_PROMPT);
          setGreeting(DEFAULT_GREETING);
        }
      } catch (error) {
        console.error('Error fetching agent settings:', error);
        setDisplayName(DEFAULT_NAME);
        setPrompt(DEFAULT_PROMPT);
        setGreeting(DEFAULT_GREETING);
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
          display_name: displayName, 
          prompt, 
          greeting,
          webhook_enabled: webhookEnabled
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Agent settings saved successfully!' });
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.message || 'Failed to save agent settings' });
      }
    } catch (error) {
      console.error('Error saving agent settings:', error);
      setMessage({ type: 'error', text: 'Failed to save agent settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDisplayName(DEFAULT_NAME);
    setPrompt(DEFAULT_PROMPT);
    setGreeting(DEFAULT_GREETING);
    setMessage(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-4">
      <div>
        <Label htmlFor="agent-name">Agent Name</Label>
        <p className="text-sm text-gray-500 mb-2">
          Give your agent a memorable name.
        </p>
        <input
          id="agent-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter agent name..."
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isSaving}
        />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Label htmlFor="agent-prompt">Agent Prompt</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-gray-400 hover:text-gray-300 transition-colors">
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-2 text-sm">
                <p className="font-medium">Tips for writing prompts:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Be clear about what the agent can and cannot do</li>
                  <li>Include your business name and context</li>
                  <li>Specify the tone (professional, friendly, formal, etc.)</li>
                  <li>List the main tasks the agent should handle</li>
                  <li>Add any specific instructions or limitations</li>
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm text-gray-500 mb-2">
          Define how your agent should behave and what it can help callers with.
        </p>
        <Textarea
          id="agent-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter the system prompt for your voice agent..."
          className="min-h-[200px] font-mono text-sm"
          disabled={isSaving}
        />
      </div>

      <div>
        <Label htmlFor="agent-greeting">Greeting Message</Label>
        <p className="text-sm text-gray-500 mb-2">
          The initial greeting your agent will say when answering calls.
        </p>
        <Textarea
          id="agent-greeting"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Enter the greeting message for your voice agent..."
          className="min-h-[100px] font-mono text-sm"
          disabled={isSaving}
        />
      </div>

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
            disabled={isSaving}
          />
        </div>

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

      {message && (
        <Alert className={message.type === 'success' ? 'border-green-600' : 'border-red-600'}>
          <AlertDescription className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
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
              Save Configuration
            </>
          )}
        </Button>

        <Button
          onClick={handleReset}
          variant="outline"
          disabled={isSaving}
          className="flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Default
        </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}