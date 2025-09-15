'use client';

import { useState, useEffect } from 'react';

const DEFAULT_PROMPT = `You are a helpful scheduling assistant for Renny's office. 
You can help callers:
- Check calendar availability
- Schedule meetings
- Provide information about available time slots

Be professional, friendly, and efficient in your responses.`;

const DEFAULT_GREETING = `Hi! Thanks for calling. I'm your AI assistant. How can I help you today?`;

const DEFAULT_NAME = 'AI Assistant';
const DEFAULT_VOICE = 'sage';

export function useAgentSettings() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [greeting, setGreeting] = useState('');
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/agents/default');
        const data = await response.json();
        
        if (response.ok && data.agent) {
          setAgentId(data.agent.id || null);
          setDisplayName(data.agent.display_name || DEFAULT_NAME);
          setPrompt(data.agent.prompt || DEFAULT_PROMPT);
          setGreeting(data.agent.greeting || DEFAULT_GREETING);
          setVoice(data.agent.voice || DEFAULT_VOICE);
          setWebhookEnabled(data.agent.webhook_enabled || false);
          setWebhookUrl(data.agent.webhook_url || '');
        } else {
          setDisplayName(DEFAULT_NAME);
          setPrompt(DEFAULT_PROMPT);
          setGreeting(DEFAULT_GREETING);
          setVoice(DEFAULT_VOICE);
        }
      } catch (error) {
        console.error('Error fetching agent settings:', error);
        setDisplayName(DEFAULT_NAME);
        setPrompt(DEFAULT_PROMPT);
        setGreeting(DEFAULT_GREETING);
        setVoice(DEFAULT_VOICE);
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
          voice,
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
    setVoice(DEFAULT_VOICE);
    setMessage(null);
  };

  return {
    agentId,
    displayName, setDisplayName,
    prompt, setPrompt,
    greeting, setGreeting,
    voice, setVoice,
    webhookEnabled, setWebhookEnabled,
    webhookUrl,
    isLoading,
    isSaving,
    message,
    handleSave,
    handleReset,
  };
}
