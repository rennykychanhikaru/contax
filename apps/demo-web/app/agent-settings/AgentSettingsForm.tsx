'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Loader2, Save, RotateCcw } from 'lucide-react';

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
            setDisplayName(data.agent.display_name || DEFAULT_NAME);
            setPrompt(data.agent.prompt || DEFAULT_PROMPT);
            setGreeting(data.agent.greeting || DEFAULT_GREETING);
          } else {
            setDisplayName(DEFAULT_NAME);
            setPrompt(DEFAULT_PROMPT);
            setGreeting(DEFAULT_GREETING);
          }
        } else {
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
          greeting
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
        <Label htmlFor="agent-prompt">Agent Prompt</Label>
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

      <div className="mt-6 p-4 bg-gray-800/50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Tips for writing prompts:</h4>
        <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
          <li>Be clear about what the agent can and cannot do</li>
          <li>Include your business name and context</li>
          <li>Specify the tone (professional, friendly, formal, etc.)</li>
          <li>List the main tasks the agent should handle</li>
          <li>Add any specific instructions or limitations</li>
        </ul>
      </div>
    </div>
  );
}